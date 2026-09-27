import 'dotenv/config';

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgres://postgres:postgres@localhost:5432/liveshop_test';
process.env.SESSION_SECRET ||= 'segredo-de-teste';
