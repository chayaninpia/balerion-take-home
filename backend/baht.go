package main

import (
	"strings"

	"github.com/shopspring/decimal"
)

var thaiDigits = []string{"ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"}
var thaiPlaces = []string{"", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"}

func DecimalToBaht(d decimal.Decimal) string {
	intPart := d.Floor()
	fracPart := d.Sub(intPart).Mul(decimal.NewFromInt(100)).RoundBank(0)

	bahtText := numberToThai(intPart)
	if bahtText == "" {
		bahtText = "ศูนย์"
	}
	bahtText += "บาท"

	if fracPart.IsZero() {
		return bahtText + "ถ้วน"
	}

	satangText := numberToThai(fracPart)
	return bahtText + satangText + "สตางค์"
}

// place names stop at ล้าน. Add another ล้าน group past 9,999,999.
func numberToThai(d decimal.Decimal) string {
	if d.IsZero() {
		return ""
	}

	n := d.IntPart()
	if n < 0 {
		n = -n
	}

	var digits []int64
	for n > 0 {
		digits = append(digits, n%10)
		n /= 10
	}

	var parts []string
	for i := len(digits) - 1; i >= 0; i-- {
		digit := digits[i]
		place := i

		if digit == 0 {
			continue
		}

		if place == 1 {
			if digit == 1 {
				parts = append(parts, "สิบ") // not "หนึ่งสิบ"
				continue
			} else if digit == 2 {
				parts = append(parts, "ยี่สิบ") // not "สองสิบ"
				continue
			}
		}

		if place == 0 && len(digits) > 1 && digit == 1 {
			parts = append(parts, "เอ็ด") // not "หนึ่ง" once a higher place exists
			continue
		}

		parts = append(parts, thaiDigits[digit])
		if place > 0 && place < len(thaiPlaces) {
			parts = append(parts, thaiPlaces[place])
		}
	}

	return strings.Join(parts, "")
}
