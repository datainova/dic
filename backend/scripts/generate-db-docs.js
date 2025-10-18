#!/usr/bin/env node
/*
  Gera dicionário de dados Markdown a partir do catálogo do Postgres.
  Requer: DATABASE_URL
  Saída: docs/data/SCHEMA_CURRENT.md
*/
const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const OUTPUT = path.join(process.cwd(), 'docs', 'data', 'SCHEMA_CURRENT.md')

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL })
  const client = await pool.connect()
  try {
    const tables = await client.query(`
      SELECT c.relname as table_name,
             pg_catalog.obj_description(c.oid) as table_comment,
             c.oid as table_oid,
             c.relrowsecurity as rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `)

    let out = []
    out.push('# Data Dictionary (public schema)\n')
    out.push(`Generated at: ${new Date().toISOString()}\n`)

    for (const t of tables.rows) {
      out.push(`\n## ${t.table_name}`)
      if (t.table_comment) out.push(`\n> ${t.table_comment}`)
      out.push('')

      // Columns
      const cols = await client.query(
        `SELECT a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                a.attnotnull AS not_null,
                pg_catalog.col_description(a.attrelid, a.attnum) AS column_comment,
                d.adsrc AS default_value
         FROM pg_attribute a
         LEFT JOIN pg_attrdef d ON a.attrelid = d.adrelid AND a.attnum = d.adnum
         WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY a.attnum`,
        [t.table_oid]
      )
      out.push('\n- Columns:')
      for (const c of cols.rows) {
        const nn = c.not_null ? 'NOT NULL' : 'NULL'
        const def = c.default_value ? ` DEFAULT ${c.default_value}` : ''
        const cm = c.column_comment ? ` — ${c.column_comment}` : ''
        out.push(`  - ${c.column_name}: ${c.data_type} ${nn}${def}${cm}`)
      }

      // Constraints
      const cons = await client.query(
        `SELECT con.conname AS name, con.contype AS type,
                pg_get_constraintdef(con.oid) AS definition
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = rel.relnamespace
         WHERE n.nspname = 'public' AND rel.relname = $1
         ORDER BY con.contype, con.conname`,
        [t.table_name]
      )
      if (cons.rowCount) {
        out.push('\n- Constraints:')
        for (const r of cons.rows) {
          const typ = ({ p: 'PRIMARY KEY', u: 'UNIQUE', f: 'FOREIGN KEY', c: 'CHECK' })[r.type] || r.type
          out.push(`  - ${typ} ${r.name}: ${r.definition}`)
        }
      }

      // Indexes
      const idx = await client.query(
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`,
        [t.table_name]
      )
      if (idx.rowCount) {
        out.push('\n- Indexes:')
        for (const r of idx.rows) {
          out.push(`  - ${r.indexname}: ${r.indexdef}`)
        }
      }

      // RLS policies
      if (t.rls_enabled) {
        const pol = await client.query(
          `SELECT polname, polcmd, polpermissive, polqual, polwithcheck
           FROM pg_policies WHERE schemaname = 'public' AND tablename = $1
           ORDER BY polname`,
          [t.table_name]
        )
        if (pol.rowCount) {
          out.push('\n- RLS Policies:')
          for (const p of pol.rows) {
            out.push(`  - ${p.polname} [${p.polcmd}] permissive=${p.polpermissive} USING=(${p.polqual}) WITH CHECK=(${p.polwithcheck})`)
          }
        } else {
          out.push('\n- RLS: enabled (no explicit policies found).')
        }
      }
    }

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
    fs.writeFileSync(OUTPUT, out.join('\n') + '\n', 'utf8')
    console.log('Documentation written to', OUTPUT)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

