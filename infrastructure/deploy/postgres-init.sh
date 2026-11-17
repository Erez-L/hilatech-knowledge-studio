#!/bin/sh
# Runs once, when the data volume is empty. Creates the owner role (migrations) and the
# application role (subject to row-level security) with the passwords from the environment.
set -eu
psql -v ON_ERROR_STOP=1 -U postgres \
  -v owner_pw="$HKS_OWNER_PASSWORD" -v app_pw="$HKS_APP_PASSWORD" <<'SQL'
CREATE ROLE hks_owner LOGIN PASSWORD :'owner_pw';
CREATE ROLE hks_app LOGIN PASSWORD :'app_pw';
CREATE DATABASE hks OWNER hks_owner;
\connect hks
CREATE EXTENSION IF NOT EXISTS vector;
SQL
