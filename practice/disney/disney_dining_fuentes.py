# Practice 2 - Disney Dining Plan Calculator
# Concepts: input(), int(), .lower(), if-elif-else, and/or, calculations,
# f-strings with money formatting.

# --- Step 1: Get the trip details ---
days = int(input("Enter number of days: "))
people = int(input("Enter number of people: "))
resort_guest = input("Are you a Disney Resort Guest? (yes/no): ").lower()
character_dining = input("Do you want character dining? (yes/no): ").lower()

is_resort = resort_guest == "yes"
wants_character = character_dining == "yes"

# --- Step 2: Show what we collected ---
print()
print("--- Dining Plan Summary ---")
print(f"Days: {days}")
print(f"People: {people}")
print(f"Resort Guest: {'YES' if is_resort else 'NO'}")
print(f"Character dining: {'YES' if wants_character else 'NO'}")
print()

# --- Step 3: Do the math, line by line ---
# Base cost: $75 per person per day.
base_cost = days * people * 75
print(f"Base cost: ${base_cost:,.2f} ({days} days × {people} people × $75)")

# Character dining add-on: $25 per person per day.
subtotal = base_cost
if wants_character:
    character_addon = days * people * 25
    subtotal = subtotal + character_addon
    print(f"Character dining add-on: +${character_addon:,.2f} "
          f"({days} days × {people} people × $25)")

print(f"Subtotal: ${subtotal:,.2f}")

# Running total we keep reducing as discounts apply.
total = subtotal

# Resort Guest discount: 10% off the subtotal.
if is_resort:
    resort_discount = subtotal * 0.10
    total = total - resort_discount
    print(f"Resort Guest discount (10%): -${resort_discount:,.2f}")

# Family discount: 5% off (applied after the resort discount) for 4+ people.
if people >= 4:
    family_discount = total * 0.05
    total = total - family_discount
    print(f"Family discount (5% for 4+ people): -${family_discount:,.2f}")

# Free dining on day 5 (only if the trip is 5 days or longer): $25 per person.
if days >= 5:
    free_dining = people * 25
    total = total - free_dining
    print(f"Free dining day (day 5): -${free_dining:,.2f} ({people} people × $25)")

print(f"FINAL TOTAL: ${total:,.2f}")

# --- Step 4: Always say goodbye ---
print()
print("Enjoy your Disney dining experience!")
