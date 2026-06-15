## Project Rules

### Testing
- **MUST manually test every change before considering it done.** After finishing any code change, run the app and verify the affected feature works correctly end-to-end. Do not rely on type-checking or linting alone.

### .env Files
- **NEVER delete a line from any `.env` file.** If a variable value needs to change, comment out the old line with `#` and add a new line below with the updated value. Example:
  ```
  # OLD_VALUE (updated 2026-06-15)
  # VITE_MY_VAR=old_value
  VITE_MY_VAR=new_value
  ```
