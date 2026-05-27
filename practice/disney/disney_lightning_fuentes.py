# Practice 3 - Disney Lightning Lane Pass Optimizer
# Concepts: input(), int(), float(), .lower(), if-elif-else, and/or/not,
# calculations, recommendations, f-strings.

# --- Step 1: Get the visitor's plans ---
rides = int(input("Enter number of rides: "))
avg_wait = float(input("Enter average wait time per ride (minutes): "))
park_hopper = input("Do you have Park Hopper ticket? (yes/no): ").lower()
single_pass = input("Are you willing to pay for Single Pass? (yes/no): ").lower()

has_hopper = park_hopper == "yes"
willing = single_pass == "yes"

# --- Step 2: Work out the wait times ---
standard_wait = rides * avg_wait   # no Lightning Lane
lightning_wait = rides * 5         # Lightning Lane = ~5 min per ride
time_saved = standard_wait - lightning_wait

print()
print("--- Lightning Lane Optimizer ---")
print(f"Rides: {rides}")
print(f"Average wait: {avg_wait:g} minutes")
print(f"Park Hopper: {'YES' if has_hopper else 'NO'}")
print()

# NOT operator: if NOT willing to pay for Single Pass, it's standard wait only.
if not willing:
    print(f"Standard total wait: {standard_wait:g} minutes ({rides} × {avg_wait:g})")
    print("You are not paying for Single Pass - standard wait only.")
    print()
    print("✗ RECOMMENDATION: Standard wait only (no Lightning Lane purchased)")
else:
    print(f"Standard total wait: {standard_wait:g} minutes ({rides} × {avg_wait:g})")
    print(f"Lightning Lane total wait: {lightning_wait:g} minutes ({rides} × 5)")
    print(f"Time saved: {time_saved:g} minutes")
    print()

    # --- Step 3: Cost with discounts ---
    cost = 25.00  # Lightning Lane base cost per person per day
    print(f"Lightning Lane base cost: ${cost:.2f}")

    # Park Hopper discount: 20% off the Lightning Lane cost.
    if has_hopper:
        hopper_discount = cost * 0.20
        cost = cost - hopper_discount
        print(f"Park Hopper discount (20%): -${hopper_discount:.2f}")

    # Multi Pass upgrade: +$10 if 5 or more rides (and paying for Single Pass).
    if rides >= 5:
        cost = cost + 10
        print(f"Multi Pass upgrade ({rides} rides): +$10.00")

    print(f"FINAL COST: ${cost:.2f}")
    print()

    # --- Step 4: Recommendation (buy if it saves more than 60 minutes) ---
    if time_saved > 60:
        print(f"✓ RECOMMENDATION: BUY Lightning Lane (you save {time_saved:g} minutes!)")
    else:
        print(f"✗ RECOMMENDATION: Don't buy (only saves {time_saved:g} minutes)")

    # Bonus message when the time saved is two hours or more.
    if time_saved >= 120:
        print()
        print("You saved more than 2 hours!")

# --- Step 5: Always say goodbye ---
print()
print("May the force be with you (and your Lightning Lane)!")
