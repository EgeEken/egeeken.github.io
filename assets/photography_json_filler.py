import os
import json
import re

current_dir = os.path.dirname(os.path.abspath(__file__))
print(f"Current directory path: {current_dir}")
photography_dir = os.path.join(current_dir, 'photography')
print(f"Photography directory path: {photography_dir}")
output_file = os.path.join(current_dir, 'photography.json')
print(f"Output file path: {output_file}")

try:
    filenames = [f for f in os.listdir(photography_dir) if os.path.isfile(os.path.join(photography_dir, f))]
except FileNotFoundError:
    print(f"Directory '{photography_dir}' not found.")
    filenames = []

# Separate filenames into numbered and non-numbered
numbered_files = []
other_files = []

for filename in filenames:
    match = re.match(r'^(\d+)\.jpg$', filename, re.IGNORECASE)
    if match:
        numbered_files.append((int(match.group(1)), filename))  # Store as tuple (number, filename)
    else:
        other_files.append(filename)

# Sort numbered files by their numeric value
numbered_files.sort(key=lambda x: x[0])

# Extract sorted filenames
sorted_filenames = [file[1] for file in numbered_files] + other_files

print(f"Found {len(filenames)} files.")
print(f"Sorted filenames: {sorted_filenames[:3]} ...")

# Write the sorted filenames to the JSON file
with open(output_file, 'w') as json_file:
    json.dump(sorted_filenames, json_file, indent=4)

print(f"File '{output_file}' has been created/updated with the sorted list of filenames.")