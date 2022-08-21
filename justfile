alias f := fmt
alias l := lint
alias t := test
alias s := start
alias las := launch_aux_services
alias has := halt_aux_services

export DATABASE_URL := "postgresql://username:password@127.0.0.1:5432/database"
export SMTP_HOST := "localhost"
export SMTP_PORT := "1025"
export SMTP_TLS_MODE := "none"
export SMTP_USERNAME := "user"
export SMTP_PASSWORD := "smtp_pass"

default:
  just --list

fmt:
  deno fmt

lint:
  deno lint

# Start auxiliary services, such as SQL database and SMTP server
launch_aux_services:
  docker compose up -d --wait --quiet-pull

# Stop auxiliary services, such as SQL database and SMTP server
halt_aux_services:
  docker compose down --remove-orphans

test: launch_aux_services && halt_aux_services
  -deno test --allow-net --allow-env --allow-read

@debug_test: launch_aux_services && halt_aux_services
  deno eval "console.log('\nNOTE: Once the debugger is open, resume execution without stepping to run tests until the next \'debugger\' statement appears.\n')"
  @-deno test --inspect-brk --allow-net --allow-env --allow-read

serve_files:
  deno run --allow-net --allow-read /file_server.ts

start:
  deno run --allow-net --allow-env --allow-read /main.ts

@debug:
  deno eval "console.log('\nNOTE: Once the debugger is open, resume execution without stepping to run the program until the next \'debugger\' statement appears.\n')"
  @deno run --inspect-brk --allow-net --allow-env --allow-read /main.ts