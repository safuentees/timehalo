# Practice 1 - Disney Ride Access System
# Concepts: input(), int(), float(), .lower(), if-elif-else, and/or/not,
# nested if, f-strings.

# --- Step 1: Get the visitor's information ---
age = int(input("Enter your age: "))
height = float(input("Enter your height in inches: "))
premier_pass = input("Do you have a Disney Premier Pass? (yes/no): ").lower()
with_adult = input("Are you accompanied by an adult? (yes/no): ").lower()

# Turn the yes/no answers into True/False so the rules read nicely.
has_pass = premier_pass == "yes"
accompanied = with_adult == "yes"

# --- Step 2: Show what we collected ---
print()
print("--- Visitor Information ---")
print(f"Age: {age}")
print(f"Height: {height} inches")
print(f"Premier Pass: {'YES' if has_pass else 'NO'}")
print(f"Accompanied by adult: {'YES' if accompanied else 'NO'}")

# --- Step 3: Work out ride access ---
print()
print("--- Ride Access ---")

# It's a Small World: everyone can ride.
print("✓ It's a Small World: You can ride!")

# Big Thunder Mountain: height 40+ AND (age 7+ OR with an adult).
if height >= 40 and (age >= 7 or accompanied):
    print("✓ Big Thunder Mountain: You can ride! (Age 7+ or with adult)")
elif height < 40:
    print("✗ Big Thunder Mountain: Too short (need 40 inches)")
else:
    print("✗ Big Thunder Mountain: Must be 7+ or accompanied by an adult")

# Space Mountain: age 10+ AND height 48+. Premier Pass just skips the line.
if age >= 10 and height >= 48:
    if has_pass:
        print("✓ Space Mountain: You can ride! (Premier Pass skips the line)")
    else:
        print("✓ Space Mountain: You can ride!")
elif age < 10:
    print("✗ Space Mountain: Too young (need 10+)")
else:
    print("✗ Space Mountain: Too short (need 48 inches)")

# Tron Lightcycle Run: Premier Pass AND height 50+ required.
if has_pass and height >= 50:
    print("✓ Tron Lightcycle Run: You can ride! (Premier Pass + height OK)")
elif not has_pass:
    print("✗ Tron Lightcycle Run: Premier Pass required")
else:
    print("✗ Tron Lightcycle Run: Too short (need 50 inches)")

# Guardians of the Galaxy: must meet BOTH age 14+ AND height 54+.
if age >= 14 and height >= 54:
    print("✓ Guardians of the Galaxy: You can ride!")
elif age < 14:
    print("✗ Guardians of the Galaxy: Too young (need 14+)")
else:
    print("✗ Guardians of the Galaxy: Too short (need 54 inches)")

# --- Step 4: Always say goodbye ---
print()
print("Have a magical day at Disney!")
