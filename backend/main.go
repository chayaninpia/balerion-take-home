package main

import (
	"fmt"

	"github.com/shopspring/decimal"
)

func main() {
	inputs := []decimal.Decimal{
		decimal.NewFromFloat(1234),
		decimal.NewFromFloat(33333.75),
		decimal.NewFromFloat(1321.21),
	}
	for _, input := range inputs {
		result := DecimalToBaht(input)
		fmt.Printf("input: [ %s ] -> result: [ %s ]\n", input.String(), result)
	}
}
