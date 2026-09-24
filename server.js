const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const path = require('path');
require('dotenv').config();

const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições originadas deste IP. Tente novamente mais tarde.' }
});
app.use('/api/', limiter);

app.use(express.static(path.join(__dirname, 'public')));

// 1. Listar e Filtrar Leads (Busca + Status + Série)
app.get('/api/leads', [
  query('search').optional().trim().escape(),
  query('status').optional().trim().escape(),
  query('serie').optional().trim().escape()
], async (req, res) => {
  const search = req.query.search || '';
  const statusFilter = req.query.status || '';
  const serieFilter = req.query.serie || '';

  let sql = `SELECT * FROM leads WHERE (nome_resp ILIKE $1 OR nome_aluno ILIKE $1 OR telefone ILIKE $1)`;
  let params = [`%${search}%`];
  let paramIdx = 2;

  if (statusFilter) {
    sql += ` AND status = $${paramIdx}`;
    params.push(statusFilter);
    paramIdx++;
  }

  if (serieFilter) {
    sql += ` AND serie ILIKE $${paramIdx}`;
    params.push(`%${serieFilter}%`);
    paramIdx++;
  }

  sql += ` ORDER BY id DESC`;

  try {
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados.' });
  }
});

// 2. Exportar Leads para CSV
app.get('/api/leads/export', [
  query('search').optional().trim().escape(),
  query('status').optional().trim().escape(),
  query('serie').optional().trim().escape()
], async (req, res) => {
  const search = req.query.search || '';
  const statusFilter = req.query.status || '';
  const serieFilter = req.query.serie || '';

  let sql = `SELECT id, nome_aluno, nome_resp, telefone, serie, status, criado_em FROM leads WHERE (nome_resp ILIKE $1 OR nome_aluno ILIKE $1 OR telefone ILIKE $1)`;
  let params = [`%${search}%`];
  let paramIdx = 2;

  if (statusFilter) {
    sql += ` AND status = $${paramIdx}`;
    params.push(statusFilter);
    paramIdx++;
  }

  if (serieFilter) {
    sql += ` AND serie ILIKE $${paramIdx}`;
    params.push(`%${serieFilter}%`);
    paramIdx++;
  }

  sql += ` ORDER BY id DESC`;

  try {
    const result = await pool.query(sql, params);
    let csv = 'ID;Nome do Aluno;Nome do Responsável;Telefone;Série;Status;Data Cadastro\n';

    result.rows.forEach(row => {
      const dataFormatada = new Date(row.criado_em).toLocaleDateString('pt-BR');
      csv += `"${row.id}";"${row.nome_aluno || ''}";"${row.nome_resp || ''}";"${row.telefone || ''}";"${row.serie || ''}";"${row.status || ''}";"${dataFormatada}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_leads.csv"');
    res.status(200).send('\uFEFF' + csv);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao exportar dados.');
  }
});

// 3. Cadastrar Lead
app.post('/api/leads', [
  body('nome_aluno').trim().notEmpty().withMessage('Nome do aluno é obrigatório.').escape(),
  body('nome_resp').optional().trim().escape(),
  body('telefone').optional().trim().escape(),
  body('serie').optional().trim().escape(),
  body('status').optional().isIn(['Visita', 'Matriculado', 'Novo Lead', 'Sem Interesse'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { nome_resp, nome_aluno, telefone, serie, status } = req.body;
  const sql = `INSERT INTO leads (nome_resp, nome_aluno, telefone, serie, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`;

  try {
    const result = await pool.query(sql, [nome_resp || '', nome_aluno, telefone || '', serie || '', status || 'Novo Lead']);
    res.status(201).json({ id: result.rows[0].id, message: 'Lead cadastrado com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar lead.' });
  }
});

// 4. Atualizar Lead
app.put('/api/leads/:id', [
  body('nome_aluno').trim().notEmpty().escape(),
  body('nome_resp').optional().trim().escape(),
  body('telefone').optional().trim().escape(),
  body('serie').optional().trim().escape(),
  body('status').optional().isIn(['Visita', 'Matriculado', 'Novo Lead', 'Sem Interesse'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { id } = req.params;
  const { nome_resp, nome_aluno, telefone, serie, status } = req.body;
  const sql = `UPDATE leads SET nome_resp = $1, nome_aluno = $2, telefone = $3, serie = $4, status = $5 WHERE id = $6`;

  try {
    const result = await pool.query(sql, [nome_resp || '', nome_aluno, telefone || '', serie || '', status || 'Novo Lead', id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json({ message: 'Lead atualizado com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar lead.' });
  }
});

// 5. Excluir Lead
app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Lead não encontrado.' });
    res.json({ message: 'Lead removido com sucesso!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir lead.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});