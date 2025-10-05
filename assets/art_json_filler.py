import os
import json

current_dir = os.path.dirname(os.path.abspath(__file__))
print(f"Current directory path: {current_dir}")
art_dir = os.path.join(current_dir, 'art')
print(f"Art directory path: {art_dir}")
output_file = os.path.join(current_dir, 'art.json')
print(f"Output file path: {output_file}")

try:
    filenames = [f for f in os.listdir(art_dir) if os.path.isfile(os.path.join(art_dir, f))]
except FileNotFoundError:
    print(f"Directory '{art_dir}' not found.")
    filenames = []

print(f"Found {len(filenames)} files.")
print(f"{filenames[:3]} ...")

with open(output_file, 'w') as json_file:
    json.dump(filenames, json_file, indent=4)

print(f"File '{output_file}' has been created/updated with the list of filenames.")