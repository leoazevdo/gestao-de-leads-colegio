const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { sheets, SPREADSHEET_ID } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SHEET_NAME = 'Página1';

// Confia no proxy do Render
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Log de requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Payload recebido:', req.body);
  }
  next();
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' }
});
app.use('/api/', limiter);

app.use(express.static(path.join(__dirname, 'public')));

// Leitura do Google Sheets
async function getRows() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:G`,
  });
  const rows = response.data.values || [];
  
  return rows.map((row, index) => ({
    row_number: index + 2,
    id: row[0] || (index + 1).toString(),
    nome_aluno: row[1] || '',
    nome_resp: row[2] || '',
    telefone: row[3] || '',
    serie: row[4] || '',
    status: row[5] || 'Novo Lead',
    criado_em: row[6] || new Date().toLocaleDateString('pt-BR')
  }));
}

// 1. GET /api/leads
app.get('/api/leads', async (req, res) => {
  try {
    const search = (req.query.search || '').toLowerCase();
    const statusFilter = req.query.status || '';
    const serieFilter = (req.query.serie || '').toLowerCase();

    let leads = await getRows();

    if (search) {
      leads = leads.filter(l => 
        l.nome_aluno.toLowerCase().includes(search) ||
        l.nome_resp.toLowerCase().includes(search) ||
        l.telefone.toLowerCase().includes(search)
      );
    }

    if (statusFilter) {
      leads = leads.filter(l => l.status === statusFilter);
    }

    if (serieFilter) {
      leads = leads.filter(l => l.serie.toLowerCase().includes(serieFilter));
    }

    leads.reverse();
    res.json(leads);
  } catch (err) {
    console.error('Erro ao buscar dados:', err);
    res.status(500).json({ error: 'Erro ao buscar dados.', details: err.message });
  }
});

// 2. GET /api/leads/export
app.get('/api/leads/export', async (req, res) => {
  try {
    let leads = await getRows();
    let csv = 'ID;Nome do Aluno;Nome do Responsável;Telefone;Série;Status;Data Cadastro\n';

    leads.reverse().forEach(row => {
      csv += `"${row.id}";"${row.nome_aluno}";"${row.nome_resp}";"${row.telefone}";"${row.serie}";"${row.status}";"${row.criado_em}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio_leads.csv"');
    res.status(200).send('\uFEFF' + csv);
  } catch (err) {
    console.error('Erro ao exportar CSV:', err);
    res.status(500).send('Erro ao exportar dados.');
  }
});

// 3. POST /api/leads (Nome do aluno NÃO é mais obrigatório)
app.post('/api/leads', async (req, res) => {
  try {
    const nome_aluno = req.body.nome_aluno || req.body.nomeAluno || req.body.nome || '';
    const nome_resp = req.body.nome_resp || req.body.nomeResp || req.body.responsavel || '';
    const telefone = req.body.telefone || req.body.celular || '';
    const serie = req.body.serie || req.body.turma || '';
    const status = req.body.status || 'Anuncio';

    // Garante que ao menos Responsável ou Aluno foi informado
    if (!nome_aluno.trim() && !nome_resp.trim()) {
      return res.status(400).json({ error: 'Preencha ao menos o nome do aluno ou do responsável.' });
    }

    const leads = await getRows();
    const newId = (leads.length + 1).toString();
    const dataCriacao = new Date().toLocaleDateString('pt-BR');

    const newRow = [newId, nome_aluno.trim(), nome_resp.trim(), telefone.trim(), serie.trim(), status, dataCriacao];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });

    console.log(`Lead #${newId} cadastrado com sucesso!`);
    res.status(201).json({ id: newId, message: 'Lead cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao inserir no Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao cadastrar lead no Google Sheets.', details: err.message });
  }
});

// 4. PUT /api/leads/:id
app.put('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = await getRows();
    const targetLead = leads.find(l => String(l.id) === String(id));

    if (!targetLead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const nome_aluno = req.body.nome_aluno !== undefined ? req.body.nome_aluno : targetLead.nome_aluno;
    const nome_resp = req.body.nome_resp !== undefined ? req.body.nome_resp : targetLead.nome_resp;
    const telefone = req.body.telefone !== undefined ? req.body.telefone : targetLead.telefone;
    const serie = req.body.serie !== undefined ? req.body.serie : targetLead.serie;
    const status = req.body.status || targetLead.status;

    const updatedRow = [
      id,
      nome_aluno,
      nome_resp,
      telefone,
      serie,
      status,
      targetLead.criado_em
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${targetLead.row_number}:G${targetLead.row_number}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [updatedRow] },
    });

    res.json({ message: 'Lead atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar no Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao atualizar lead.', details: err.message });
  }
});

// 5. DELETE /api/leads/:id
app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = await getRows();
    const targetLead = leads.find(l => String(l.id) === String(id));

    if (!targetLead) return res.status(404).json({ error: 'Lead não encontrado.' });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${targetLead.row_number}:G${targetLead.row_number}`,
    });

    console.log(`Lead #${id} removido da linha ${targetLead.row_number}`);
    res.json({ message: 'Lead removido com sucesso!' });
  } catch (err) {
    console.error('Erro ao deletar no Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao excluir lead.', details: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error('ERRO NÃO TRATADO NO EXPRESS:', err);
  res.status(500).json({ error: 'Erro interno no servidor.', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});