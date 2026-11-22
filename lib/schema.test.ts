import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb } from '@/test/db'
import { PGlite } from '@electric-sql/pglite'
import { initDb, wrap, type Db } from '@/lib/db'
import { SCHEMA } from '@/lib/schema'

let db: Db
beforeEach(async () => {
  db = await createTestDb()
})

const one = async (sql: string, p: unknown[] = []) => (await db.query<{ id: string }>(sql, p))[0]

describe('schema', () => {
  it('aceita inserts válidos em todas as tabelas', async () => {
    await db.query(`insert into profile (birth_date, sex, height_cm, activity_level, fitness, experience, days_per_week, minutes_per_session, equipment, restrictions)
      values ('1990-01-01','m',175,1.4,'medio','iniciante',3,45,'{halteres}','nenhuma')`)
    await db.query(`insert into goals (start_weight_kg,target_weight_kg,kcal,protein_g,carbs_g,fat_g) values (90,80,2000,150,200,60)`)
    const food = await one(`insert into foods (name,origin,search,kcal_100,protein_100,carbs_100,fat_100) values ('Arroz','taco','arroz',128,2.5,28,0.2) returning id`)
    const meal = await one(`insert into meals (day,type) values ('2026-11-22','almoco') returning id`)
    await db.query(`insert into meal_items (meal_id,food_id,name,grams,kcal,protein_g,carbs_g,fat_g,source) values ($1,$2,'Arroz',100,128,2.5,28,0.2,'manual')`, [meal.id, food.id])
    await db.query(`insert into weights (measured_at,kg) values (now(),80)`)
    await db.query(`insert into body_measurements (measured_at,region,cm) values (now(),'cintura',90)`)
    await db.query(`insert into body_composition (measured_at,metric,value,unit,source,method) values (now(),'body_fat_pct',20,'%','calculated','marinha')`)
    await db.query(`insert into body_photos (taken_at,angle,path) values (now(),'frente','a.jpg')`)
    const ex = await one(`insert into exercises (name,description,kind,muscles,demo_url) values ('Agachamento','x','musculacao','{coxa}',null) returning id`)
    const plan = await one(`insert into workout_plans (name,origin,active,notes) values ('A','manual',true,null) returning id`)
    await db.query(`insert into plan_items (plan_id,weekday,exercise_id,position,sets,reps,duration_s,rest_s,load_kg) values ($1,1,$2,0,3,10,null,60,20)`, [plan.id, ex.id])
    const ses = await one(`insert into workout_sessions (day,plan_id,started_at,finished_at,duration_min,rpe,notes) values ('2026-11-22',$1,now(),now(),45,7,null) returning id`, [plan.id])
    await db.query(`insert into session_sets (session_id,exercise_id,set_no,reps,load_kg,duration_s,rpe) values ($1,$2,1,10,20,null,7)`, [ses.id, ex.id])
    const conv = await one(`insert into ai_conversations (title) values ('oi') returning id`)
    await db.query(`insert into ai_messages (conversation_id,role,content) values ($1,'user','olá')`, [conv.id])
    await db.query(`insert into weekly_reports (week_start,numbers,analysis) values ('2026-11-16','{}','ok')`)
    await db.query(`insert into ai_usage (feature,model,tokens_in,tokens_out,cost_usd) values ('coach','gpt',10,20,0.001)`)
  })

  it('proíbe update em medições, mas permite delete', async () => {
    await db.query(`insert into weights (measured_at,kg) values (now(),75)`)
    await expect(db.query(`update weights set kg = 80`)).rejects.toThrow(/não pode ser alterado/)
    await db.query(`delete from weights`)
    expect(await db.query(`select 1 from weights`)).toHaveLength(0)
  })

  it('rejeita grams = 0 e cm = 400', async () => {
    const meal = await one(`insert into meals (day,type) values ('2026-11-22','cafe') returning id`)
    await expect(
      db.query(`insert into meal_items (meal_id,name,grams,kcal,protein_g,carbs_g,fat_g,source) values ($1,'x',0,0,0,0,0,'manual')`, [meal.id]),
    ).rejects.toThrow()
    await expect(db.query(`insert into body_measurements (measured_at,region,cm) values (now(),'cintura',400)`)).rejects.toThrow()
  })

  it('banco antigo (schema da Task 2) migra para o mesmo schema de um banco novo', async () => {
    // Task 2: sem body_photos.thumb_path, weekly_reports.analysis not null, schema_version 0.
    const old = SCHEMA.replace(/\n\s*thumb_path text,/, '').replace(/analysis text,/, 'analysis text not null,')
    expect(old).not.toBe(SCHEMA)
    expect(old).not.toMatch(/thumb_path/)
    const pgOld = new PGlite()
    await pgOld.exec(`begin; ${old}; commit;`)
    await pgOld.exec(`create table app_meta (key text primary key, value text not null)`)
    await pgOld.exec(`insert into app_meta values ('schema_version', '0')`)
    await initDb(pgOld)
    const cols = (d: Db) =>
      d.query(
        `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns
         where table_schema = 'public' order by table_name, column_name`,
      )
    expect(await cols(wrap(pgOld))).toEqual(await cols(db))
    const [{ value }] = await wrap(pgOld).query<{ value: string }>(`select value from app_meta where key = 'schema_version'`)
    const [{ value: fresh }] = await db.query<{ value: string }>(`select value from app_meta where key = 'schema_version'`)
    expect(value).toBe(fresh)
  })
})
