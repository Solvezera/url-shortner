import fastify from "fastify";
import { sql } from './lib/postgres'
import { z } from 'zod'
import postgres from "postgres";
import { redis } from './lib/redis'

const app = fastify()

// ROTAS POST
app.post('/api/links', async (request, reply) => {
    const linkSchema = z.object({
        code: z.string().min(3),
        url: z.string().url(),
    })

    const { code, url } = linkSchema.parse(request.body)

    try {
        const result = await sql/*sql*/`
        INSERT INTO short_links (code, url_orign) VALUES (${code}, ${url}) RETURNING id
        `
        const link = result[0]

        // 201 - Registro criado com sucesso | 200 - Sucesso
        return reply.status(201).send({ shortLinkId: link.code })

    } catch (err) {
        if (err instanceof postgres.PostgresError) {
            if (err.code == '23505') {
                return reply.status(400).send('Código duplicado')
            }
        }

        console.error(err)

        return reply.status(500).send('Internal Error')
    }
})

// ROTAS GET
app.get('/api/gerados', async () => {
    const result = await sql/*sql*/`
   SELECT * FROM short_links ORDER BY createad_at DESC
   `
    return result
})

app.get('/:code', async (request, reply) => {
    const getLinkSchema = z.object({
        code: z.string().min(3),
    })

    const { code } = getLinkSchema.parse(request.params)

    const result = await sql/*sql*/`
    SELECT id, url_orign, code FROM short_links where code = ${code}
    `

    if (result.length == 0) {
        return reply.status(400).send('Link não encontrado')
    }

    const link = result[0]

    await redis.zIncrBy('metrics', 1, link.code)

    //301 - Link permanente | 302 - Link temporário
    return reply.redirect(301, link.url_orign)
})

app.get('/api/metricas', async (request, reply) => {
    try {

        // REMOVER MÉTRICAS
        // await redis.zRemRangeByRank('metrics', 0, -1);
        // console.log('Removido todas as métricas');
        
        const result = await redis.zRangeByScoreWithScores('metrics', 0, 50);

        const result_ordenado = result
            .sort((a, b) => b.score - a.score)
            .map(item => {
                return {
                    code: item.value,
                    acessos: item.score,
                }
            })

        return result_ordenado

    } catch (error) {
        reply.status(500).send('Erro ao retornar as métricas.');
    }
});

// ROTAS PUT

// ROTAS DELETE



// CONFIG. DO SERVER
app.listen({
    port: 3333,
}).then(() => {
    console.log('Servidor rodando')
})