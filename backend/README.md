# Decimal to Thai Baht

`DecimalToBaht` turns a decimal amount into Thai text with baht and satang.

## Run

From this directory:

```bash
go run .
```

```
input: [ 1234 ] -> result: [ หนึ่งพันสองร้อยสามสิบสี่บาทถ้วน ]
input: [ 33333.75 ] -> result: [ สามหมื่นสามพันสามร้อยสามสิบสามบาทเจ็ดสิบห้าสตางค์ ]
input: [ 1321.21 ] -> result: [ หนึ่งพันสามร้อยยี่สิบเอ็ดบาทยี่สิบเอ็ดสตางค์ ]
```

Go version is the `go` line in `go.mod`. Dependencies: `go mod tidy`.

## Call it

```go
amount := decimal.NewFromString("1321.21")
text := DecimalToBaht(amount) // หนึ่งพันสามร้อยยี่สิบเอ็ดบาทยี่สิบเอ็ดสตางค์
```

No fractional part ends in `ถ้วน`. A fractional part is satang and ends in `สตางค์`. Satang uses banker's rounding (half to even).

Tens and ones follow Thai spelling: 10 is `สิบ`, 20 is `ยี่สิบ`, and a trailing 1 after a higher place is `เอ็ด` (11 is `สิบเอ็ด`). Place names stop at `ล้าน`.

## Test

```bash
go test ./...
go test -run TestDecimalToBaht/1234
go test -cover
```
