const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, query, validationResult } = require('express-validator');
const path = require('path');
require('dotenv').config();

const { sheets, SPREADSHEET_ID } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const SHEET_NAME = 'Página1'; // Nome exato da aba na sua planilha

// Confia no proxy reverso do Render
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Log visual no console para TODAS as requisições recebidas
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

// Função Auxiliar para ler todas as linhas da planilha
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

// 1. Listar e Filtrar Leads
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
    console.error('Erro ao buscar dados do Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao buscar dados na planilha.', details: err.message });
  }
});

// 2. Exportar CSV
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

// 3. Cadastrar Lead
app.post('/api/leads', async (req, res) => {
  try {
    // Aceita nomes de atributos em snake_case ou camelCase vindos do frontend
    const nome_aluno = req.body.nome_aluno || req.body.nomeAluno || req.body.nome;
    const nome_resp = req.body.nome_resp || req.body.nomeResp || req.body.responsavel;
    const telefone = req.body.telefone || req.body.celular;
    const serie = req.body.serie || req.body.turma;
    const status = req.body.status || 'Novo Lead';

    if (!nome_aluno) {
      console.warn('Tentativa de cadastro sem nome do aluno. Body recebido:', req.body);
      return res.status(400).json({ error: 'O nome do aluno é obrigatório.' });
    }

    const leads = await getRows();
    const newId = (leads.length + 1).toString();
    const dataCriacao = new Date().toLocaleDateString('pt-BR');

    const newRow = [newId, nome_aluno, nome_resp || '', telefone || '', serie || '', status, dataCriacao];

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

// 4. Atualizar Lead
app.put('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const nome_aluno = req.body.nome_aluno || req.body.nomeAluno || req.body.nome;
    const nome_resp = req.body.nome_resp || req.body.nomeResp || req.body.responsavel;
    const telefone = req.body.telefone || req.body.celular;
    const serie = req.body.serie || req.body.turma;
    const status = req.body.status || 'Novo Lead';

    const leads = await getRows();
    const targetLead = leads.find(l => l.id === id);

    if (!targetLead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const updatedRow = [
      id,
      nome_aluno || targetLead.nome_aluno,
      nome_resp !== undefined ? nome_resp : targetLead.nome_resp,
      telefone !== undefined ? telefone : targetLead.telefone,
      serie !== undefined ? serie : targetLead.serie,
      status || targetLead.status,
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

// 5. Excluir Lead
app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = await getRows();
    const targetLead = leads.find(l => l.id === id);

    if (!targetLead) return res.status(404).json({ error: 'Lead não encontrado.' });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${targetLead.row_number}:G${targetLead.row_number}`,
    });

    res.json({ message: 'Lead removido com sucesso!' });
  } catch (err) {
    console.error('Erro ao deletar no Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao excluir lead.', details: err.message });
  }
});

// Middleware Global de Captura de Erros
app.use((err, req, res, next) => {
  console.error('ERRO NÃO TRATADO NO EXPRESS:', err);
  res.status(500).json({ error: 'Erro interno no servidor.', details: err.message });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});