document.addEventListener('DOMContentLoaded', () => {
    // Atalhos da tela; o passe do admin vem da sessão, não de um bilhete premiado.
    const apiBaseUrl = 'http://localhost:3001';
    const message = document.getElementById('admin-message');
    const inviteForm = document.getElementById('invite-form');
    const inviteButton = document.getElementById('invite-submit');
    const refreshButton = document.getElementById('refresh-instructors');
    const instructorsBody = document.getElementById('instructors-body');

    // Mostra recados na própria tela, sem obrigar ninguém a caçar erro no console.
    function showMessage(text, type = 'success') {
        message.textContent = text;
        message.dataset.type = type;
        message.hidden = false;
    }

    // Toda chamada leva o passe da sessão para o servidor saber quem está pedindo.
    async function apiRequest(path, options = {}) {
        const accessToken = sessionStorage.getItem('nocaute.accessToken');
        const response = await fetch(`${apiBaseUrl}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });
        const data = response.status === 204 ? null : await response.json();
        if (!response.ok) {
            const error = new Error(data?.error || 'A solicitação não foi concluída.');
            error.status = response.status;
            throw error;
        }
        return data;
    }

    // Preenche a tabela sem interpretar texto como HTML e fazer bagunça.
    function addCell(row, text) {
        const cell = document.createElement('td');
        cell.textContent = text || '—';
        row.append(cell);
    }

    // Busca a lista e deixa claro se está carregando, vazia ou com algum tropeço.
    async function loadInstructors() {
        refreshButton.disabled = true;
        instructorsBody.replaceChildren();
        const loadingRow = document.createElement('tr');
        addCell(loadingRow, 'Carregando instrutores...');
        loadingRow.firstElementChild.colSpan = 4;
        instructorsBody.append(loadingRow);

        try {
            const { instructors } = await apiRequest('/api/admin/instructors');
            instructorsBody.replaceChildren();
            if (instructors.length === 0) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 4;
                cell.className = 'admin-empty';
                cell.textContent = 'Nenhum instrutor cadastrado.';
                row.append(cell);
                instructorsBody.append(row);
                return;
            }

            instructors.forEach(instructor => {
                const row = document.createElement('tr');
                addCell(row, instructor.fullName);
                addCell(row, instructor.email);
                addCell(row, instructor.status);
                addCell(row, new Intl.DateTimeFormat('pt-BR').format(new Date(instructor.createdAt)));
                instructorsBody.append(row);
            });
        } catch (error) {
            console.error('Falha ao carregar instrutores.', error);
            instructorsBody.replaceChildren();
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.className = 'admin-empty';
            cell.textContent = error.message;
            row.append(cell);
            instructorsBody.append(row);
        } finally {
            refreshButton.disabled = false;
        }
    }

    // Envia o convite; se der ruim, avisa em vez de fingir que deu tudo certo.
    inviteForm.addEventListener('submit', async event => {
        event.preventDefault();
        message.hidden = true;
        const name = document.getElementById('instructor-name').value.trim();
        const email = document.getElementById('instructor-email').value.trim();
        inviteButton.disabled = true;

        try {
            const result = await apiRequest('/api/admin/instructors/invite', {
                method: 'POST',
                body: JSON.stringify({ name, email })
            });
            showMessage(result.message);
            inviteForm.reset();
            await loadInstructors();
        } catch (error) {
            console.error('Falha ao enviar convite de instrutor.', error);
            showMessage(error.message, 'error');
        } finally {
            inviteButton.disabled = false;
        }
    });

    refreshButton.addEventListener('click', loadInstructors);
    loadInstructors();
});
