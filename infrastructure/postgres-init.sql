-- Development credentials only.
CREATE ROLE hks_owner LOGIN PASSWORD 'hks_owner_dev';
CREATE ROLE hks_app LOGIN PASSWORD 'hks_app_dev';
CREATE DATABASE hks_dev OWNER hks_owner;
CREATE DATABASE hks_test OWNER hks_owner;
\connect hks_dev
CREATE EXTENSION IF NOT EXISTS vector;
\connect hks_test
CREATE EXTENSION IF NOT EXISTS vector;
