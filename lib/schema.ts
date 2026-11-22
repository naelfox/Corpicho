/**
 * Schema do banco local (PGlite, dentro do app). Aplicado na primeira abertura.
 * Mudanças futuras: adicione um passo em MIGRATIONS (nunca edite um já publicado).
 */
export const SCHEMA = `
create table profile (id int primary key default 1 check (id = 1));
`

export const MIGRATIONS: string[] = []
