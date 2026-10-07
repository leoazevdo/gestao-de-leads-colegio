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
app.set('trust proxy', 1);
const SHEET_NAME = 'Página1'; // Nome da aba na planilha

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

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
  
  // Mapeia linhas do Sheets para Objetos JavaScript com índice (ID)
  return rows.map((row, index) => ({
    row_number: index + 2, // Linha real no Google Sheets (linha 1 é cabeçalho)
    id: row[0] || (index + 1).toString(),
    nome_aluno: row[1] || '',
    nome_resp: row[2] || '',
    telefone: row[3] || '',
    serie: row[4] || '',
    status: row[5] || 'Novo Lead',
    criado_em: row[6] || new Date().toISOString()
  }));
}

// 1. Listar e Filtrar Leads
app.get('/api/leads', async (req, res) => {
  try {
    const search = (req.query.search || '').toLowerCase();
    const statusFilter = req.query.status || '';
    const serieFilter = (req.query.serie || '').toLowerCase();

    let leads = await getRows();

    // Filtros
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

    // Ordenar do mais recente para o mais antigo
    leads.reverse();

    res.json(leads);
  } catch (err) {
    console.error('Erro ao buscar dados do Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao buscar dados na planilha.' });
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
    console.error(err);
    res.status(500).send('Erro ao exportar dados.');
  }
});

// 3. Cadastrar Lead (Nova Linha no Google Sheets)
app.post('/api/leads', [
  body('nome_aluno').trim().notEmpty().escape(),
  body('nome_resp').optional().trim().escape(),
  body('telefone').optional().trim().escape(),
  body('serie').optional().trim().escape(),
  body('status').optional().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { nome_resp, nome_aluno, telefone, serie, status } = req.body;
    const leads = await getRows();
    
    const newId = (leads.length + 1).toString();
    const dataCriacao = new Date().toLocaleDateString('pt-BR');

    const newRow = [newId, nome_aluno, nome_resp || '', telefone || '', serie || '', status || 'Novo Lead', dataCriacao];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });

    res.status(201).json({ id: newId, message: 'Lead cadastrado com sucesso!' });
  } catch (err) {
    console.error('Erro ao inserir no Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao cadastrar lead.' });
  }
});

// 4. Atualizar Lead (Editar Linha no Google Sheets)
app.put('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome_resp, nome_aluno, telefone, serie, status } = req.body;

    const leads = await getRows();
    const targetLead = leads.find(l => l.id === id);

    if (!targetLead) return res.status(404).json({ error: 'Lead não encontrado.' });

    const updatedRow = [
      id,
      nome_aluno,
      nome_resp || '',
      telefone || '',
      serie || '',
      status || 'Novo Lead',
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
    res.status(500).json({ error: 'Erro ao atualizar lead.' });
  }
});

// 5. Excluir Lead (Limpar Linha no Google Sheets)
app.delete('/api/leads/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const leads = await getRows();
    const targetLead = leads.find(l => l.id === id);

    if (!targetLead) return res.status(404).json({ error: 'Lead não encontrado.' });

    // Limpa o conteúdo das células da linha
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A${targetLead.row_number}:G${targetLead.row_number}`,
    });

    res.json({ message: 'Lead removido com sucesso!' });
  } catch (err) {
    console.error('Erro ao deletar no Google Sheets:', err);
    res.status(500).json({ error: 'Erro ao excluir lead.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});