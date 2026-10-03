
import re

with open('src/server/ai.ts', 'r', encoding='utf-8') as f:
    content = f.read()

print(f"File size: {len(content)}")
print(f"Contains bug: {'model: resolveModel }\n    : options;' in content}")

# Replace the buggy line
fixed = content.replace('model: resolveModel }
    : options;', 'model: resolveModel(resolvedModel) }
    : options;')

if fixed == content:
    print("Pattern not found with LF, trying CRLF")
    fixed = content.replace('model: resolveModel }
    : options;', 'model: resolveModel(resolvedModel) }
    : options;')

with open('src/server/ai.ts', 'w', encoding='utf-8') as f:
    f.write(fixed)

print(f"Done, new size: {len(fixed)}")
