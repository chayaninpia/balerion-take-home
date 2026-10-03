# Salmon Allocation

An interactive interface for fairly allocating limited salmon stock across a large
queue of customer orders, drawing from multiple warehouses and suppliers.

Loads with **5,200 sub-orders** already auto-allocated by the business rules, and
stays responsive while they are filtered, sorted and hand-adjusted.

## Running it

From this directory:

```bash
npm install
npm run dev          # http://localhost:5173
```

Node 20+.

```bash
npm test
npm run typecheck
npm run build        # writes dist/
npm run preview      # serve that build
```

## How allocation works

### Auto-assignment (runs on page load)

Sub-orders are sorted and filled in this order:

1. **Order type** — `EMERGENCY` → `OVER_DUE` → `DAILY`
2. **Oldest first** (FIFO) within the same type
3. Sub-order id, as a stable final tie-break

Each sub-order then takes as much as it can, bounded by:

- **Stock** remaining in the lots it is allowed to draw from
- **Credit** remaining for its customer, shared across all that customer's orders

### Pricing

Unit price comes from the **supplier the stock is drawn from**, multiplied by the
tier for the order's type:

| Type | Tier |
|---|---:|
| `EMERGENCY` | 125% |
| `OVER_DUE` | 100% |
| `DAILY` | 90% |

A sub-order that spans several suppliers is priced per part, at each supplier's
own rate. All money and quantity values are rounded to 2 decimal places using
**Banker's rounding** (round-half-to-even).

### Wildcards

`WH-000` and `SP-000` mean "any warehouse" / "any supplier". Eligible lots are
consumed **highest remaining stock first**, and a single sub-order may span
several lots when no one lot can cover it. The detail panel shows exactly which
lots a row drew from and at what price.

### Manual allocation

Click a row and type the quantity in the detail panel. Enter or blur commits it.
**Allocate max** asks for the full request. The amount is clamped to remaining
stock and the customer's remaining credit, so those two limits hold by
construction.

If the granted amount is below what was typed, a dialog shows the requested
quantity, the quantity actually allocated, and why: stock, credit, or no price.
The row is then marked **manual**.

- **Re-run auto** keeps manual rows and reallocates the rest around them
- **Clear** on that row drops the pin
- **Reset to auto** drops every manual row and allocates by the rules
- **Clear all** zeroes every allocation

## Assumptions

The spec left these open. I picked the reading that makes the stated rules
coherent, and noted it here rather than silently deciding.

- **Credit is a monetary limit (THB), not a quantity.** The spec requires both a
  credit limit and supplier/tier pricing; pricing only constrains anything if
  credit is spent in currency. So credit is consumed as `qty × unitPrice`.
- **Sub-orders are the unit of allocation.** The parent `Order` only groups rows
  for display, since routing, item and quantity are all per sub-order.
- **A wildcard sub-order may split across lots.** Refusing to split would leave
  stock unallocated while an order went short, which contradicts "fairly
  allocate".
- **Price is keyed on (item, supplier), with tier as a multiplier.** The example
  table lists tier percentages without repeating a base price per tier, so tiers
  are read as multipliers over the supplier's base price.
- **Missing price data blocks allocation** rather than defaulting to zero — a
  silent 0 THB allocation would quietly bypass the credit limit. Such rows are
  reported as `no price` in the detail panel.
- **Stock and orders are generated** (deterministically, seeded) since no real
  dataset was supplied. The spec's exact example tables are available via the
  **Spec example** toggle for checking the rules by hand.

## Performance

The dataset is ~5,200 rows by default and the design holds at 50,000.

- **Allocation is a single pass.** Lots are pre-indexed by item, so each
  sub-order only looks at lots it could actually use. Measured on an M-series
  laptop: **32 ms** for 5,200 rows, **272 ms** for 50,000 — both inside one page
  load, and both bounded by assertions in the test suite.
- **The ledger is mutated, not cloned.** A manual edit releases one sub-order's
  claim and re-applies it — O(lots touched), not O(dataset). Measured at
  **0.004 ms per edit**, flat as the dataset grows. Cloning several 5,000-entry
  maps per keystroke was the obvious trap here; React re-renders off a version
  counter instead.
- **Rows are virtualised** (`@tanstack/react-virtual`), so only the visible
  window is mounted. A test asserts fewer than 200 rows are in the DOM for a
  5,200-row dataset.
- **Search is debounced** 150 ms; filter chips and selects apply immediately.

## Finding an order

- Free-text search across sub-order, order, customer id and name, item,
  warehouse, supplier and remark
- Filter chips for order type and fill status (filled / partial / unfilled), plus
  a **Manual only** view
- Dropdowns for item, warehouse and supplier
- Sortable columns: priority, created date, request, allocated, fill %, id
- Click a row for the detail: lots drawn, price paid, remaining credit, and why
  it is short. Below 1280px the grid becomes a card list and the detail opens
  as a drawer over it

## Project layout

```
src
├── domain/          # allocation rules — no React, fully unit-tested
│   ├── types.ts
│   ├── rounding.ts      # Banker's rounding, budget-safe quantity math
│   └── allocation.ts    # auto-assignment, manual edits, the ledger
├── data/generate.ts # deterministic dataset generator + the spec example
├── app/             # state hooks and the page shell
├── components/      # table, filters, summary, detail panel
└── lib/             # formatting, debounce
```

The allocation rules are deliberately free of React so they can be tested
directly and would port to a service unchanged.

## Testing

`npm test` covers:

- **Rounding** — Banker's ties, negatives, precision; budget math never exceeds
  the limit
- **Rules** — type priority, FIFO, credit sharing across a customer's orders,
  wildcard lot ordering and splitting, per-supplier pricing, missing prices
- **Manual edits** — clamping to stock and credit, idempotency under repeated
  edits, stock and credit returned on lowering or clearing
- **Invariants at full scale** — on all 5,200 rows: no lot over-drawn, no credit
  limit exceeded, nothing allocated beyond request, parts summing to totals, and
  emergency rows filling at a higher rate than daily
- **Performance** — bounds on 5,200-row and 50,000-row allocation, and on 200
  successive manual edits
- **UI** — mounts and auto-allocates on load, virtualisation window, search
  filtering, manual commit and clamping, clear/reset, detail panel sources

## Deploying

`npm run build` writes `dist/` with relative asset paths, so the same folder
works at a domain root or a sub-path.

## Known limits

- State is in-memory only; there is no persistence layer to commit an allocation
  plan to.
- `Re-run auto` preserves manual rows but, like any greedy pass, does not
  retroactively optimise earlier allocations against later ones — it is the FIFO
  priority rule the spec asked for, not a global optimum.
- Below 1280px the desktop grid is a card list. The detail opens as a drawer.
