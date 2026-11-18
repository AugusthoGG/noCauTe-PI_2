document.addEventListener('DOMContentLoaded', () => {
    // O painel carrega tudo da API; nenhum número vem de chute ou planilha fantasma.
    const apiBaseUrl = 'https://nocaute-pi-2.onrender.com';
    const message = document.getElementById('admin-message');
    const inviteForm = document.getElementById('invite-form');
    const classForm = document.getElementById('class-form');
    const sessionForm = document.getElementById('session-form');
    const membershipForm = document.getElementById('membership-form');
    const instructorsBody = document.getElementById('instructors-body');
    const sessionsBody = document.getElementById('sessions-body');
    const reservationsBody = document.getElementById('reservations-body');
    const membershipsBody = document.getElementById('memberships-body');
    const classSelect = document.getElementById('session-class');
    const instructorSelect = document.getElementById('session-instructor');
    const modalitySelect = document.getElementById('class-modality');
    const membershipStudentSelect = document.getElementById('membership-student');
    const membershipPlanSelect = document.getElementById('membership-plan');
    const membershipSubmit = document.getElementById('membership-submit');
    const views = [...document.querySelectorAll('.view-section')];
    let catalog = { modalities: [], classes: [], instructors: [] };
    // --- Controle de Navegação entre Seções ---
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const sections = document.querySelectorAll('.admin-view');

    function ativarSecao(sectionId) {
        // Esconde todas as seções e exibe apenas a selecionada
        sections.forEach(section => {
            section.style.display = (`#${section.id}` === sectionId) ? '' : 'none';
        });

        // Atualiza o botão ativo e acessibilidade no menu
        navItems.forEach(item => {
            const isSelected = item.getAttribute('href') === sectionId;
            item.classList.toggle('active', isSelected);
            
            if (isSelected) {
                item.setAttribute('aria-current', 'page');
            } else {
                item.removeAttribute('aria-current');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            const targetId = item.getAttribute('href');
            
            ativarSecao(targetId);
            history.pushState(null, '', targetId);
        });
    });

    window.addEventListener('popstate', () => {
        ativarSecao(window.location.hash || '#dashboard');
    });

    // Inicia exibindo a seção da URL ou o #dashboard por padrão
    ativarSecao(window.location.hash || '#dashboard');

    // Deixa o resultado da operação visível, inclusive quando a API disser "não".
    function showMessage(text, type = 'success') {
        message.textContent = text;
        message.dataset.type = type;
        message.hidden = false;
        message.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Usa a sessão atual em cada pedido e mostra a mensagem devolvida pelo servidor.
    async function apiRequest(path, options = {}) {
        const send = async token => {
            const response = await fetch(`${apiBaseUrl}${path}`, {
                ...options,
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    ...options.headers
                }
            });
            return { response, data: response.status === 204 ? null : await response.json() };
        };
        let accessToken = sessionStorage.getItem('nocaute.accessToken');
        let { response, data } = await send(accessToken);
        if (response.status === 401) {
            const refreshToken = sessionStorage.getItem('nocaute.refreshToken');
            if (refreshToken) {
                const refreshResponse = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                });
                const refreshed = await refreshResponse.json();
                if (refreshResponse.ok) {
                    accessToken = refreshed.accessToken;
                    sessionStorage.setItem('nocaute.accessToken', refreshed.accessToken);
                    sessionStorage.setItem('nocaute.refreshToken', refreshed.refreshToken);
                    ({ response, data } = await send(accessToken));
                }
            }
        }
        if (!response.ok) {
            const error = new Error(data?.error || 'A solicitação não foi concluída.');
            error.status = response.status;
            throw error;
        }
        return data;
    }
    // A navegação dos relatórios fica fora deste escopo e reutiliza a mesma sessão autenticada.
    window.adminApiRequest = apiRequest;

    function addCell(row, text) {
        const cell = document.createElement('td');
        cell.textContent = text || '—';
        row.append(cell);
        return cell;
    }

    function addEmptyRow(body, columns, text) {
        const row = document.createElement('tr');
        const cell = addCell(row, text);
        cell.colSpan = columns;
        cell.className = 'admin-empty';
        body.replaceChildren(row);
    }

    function formatDate(value, options = {}) {
        if (!value) return '—';
        return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
    }

    function setMetrics(metrics) {
        document.getElementById('metric-students').textContent = metrics.students.toLocaleString('pt-BR');
        document.getElementById('metric-instructors').textContent = metrics.instructors.toLocaleString('pt-BR');
        document.getElementById('metric-classes').textContent = metrics.classes.toLocaleString('pt-BR');
        document.getElementById('metric-sessions').textContent = metrics.upcomingSessions.toLocaleString('pt-BR');
        document.getElementById('metric-reservations').textContent = metrics.reservations.toLocaleString('pt-BR');
    }

    function instructorOptions(selectedId) {
        const select = document.createElement('select');
        select.className = 'session-instructor-select';
        select.setAttribute('aria-label', 'Instrutor responsável pela aula');
        const noInstructor = document.createElement('option');
        noInstructor.value = '';
        noInstructor.textContent = 'Sem instrutor';
        select.append(noInstructor);
        catalog.instructors.forEach(instructor => {
            const option = document.createElement('option');
            option.value = instructor.id;
            option.textContent = instructor.full_name || 'Instrutor';
            select.append(option);
        });
        select.value = selectedId || '';
        return select;
    }

    async function updateSessionInstructor(sessionId, select) {
        const previousValue = select.dataset.savedValue || '';
        select.disabled = true;
        try {
            await apiRequest(`/api/admin/sessions/${encodeURIComponent(sessionId)}/instructor`, {
                method: 'PATCH',
                body: JSON.stringify({ instructorId: select.value || null })
            });
            select.dataset.savedValue = select.value;
            showMessage('Instrutor da aula atualizado.');
            await loadDashboard();
        } catch (error) {
            select.value = previousValue;
            showMessage(error.message, 'error');
        } finally {
            select.disabled = false;
        }
    }

    function renderSessions(sessions) {
        if (!sessions.length) {
            addEmptyRow(sessionsBody, 4, 'Nenhuma aula futura cadastrada. Agende a primeira na seção “Aulas e horários”.');
            return;
        }

        const rows = sessions.map(session => {
            const row = document.createElement('tr');
            const className = session.class?.name || 'Aula';
            const modalityName = session.class?.modality?.name;
            addCell(row, modalityName ? `${className} · ${modalityName}` : className);
            addCell(row, formatDate(session.starts_at, { dateStyle: 'short', timeStyle: 'short' }));
            addCell(row, `${session.reservedCount}/${session.capacity}`);
            const instructorCell = document.createElement('td');
            const select = instructorOptions(session.instructor?.id);
            select.dataset.savedValue = select.value;
            select.addEventListener('change', () => updateSessionInstructor(session.id, select));
            instructorCell.append(select);
            row.append(instructorCell);
            return row;
        });
        sessionsBody.replaceChildren(...rows);
    }

    function renderRecentReservations(reservations) {
        if (!reservations.length) {
            addEmptyRow(reservationsBody, 4, 'Ainda não há reservas de alunos.');
            return;
        }
        const rows = reservations.map(reservation => {
            const row = document.createElement('tr');
            addCell(row, reservation.student?.full_name || 'Aluno');
            addCell(row, reservation.session?.class?.name || 'Aula');
            addCell(row, formatDate(reservation.session?.starts_at, { dateStyle: 'short', timeStyle: 'short' }));
            addCell(row, formatDate(reservation.reserved_at, { dateStyle: 'short', timeStyle: 'short' }));
            return row;
        });
        reservationsBody.replaceChildren(...rows);
    }

    // Atualiza contadores, horários, instrutores e reservas consultando a base.
    async function loadDashboard() {
        const result = await apiRequest('/api/admin/dashboard');
        setMetrics(result.metrics);
        renderSessions(result.upcomingSessions);
        renderRecentReservations(result.recentReservations);
    }

    async function loadInstructors() {
        const { instructors } = await apiRequest('/api/admin/instructors');
        if (!instructors.length) {
            addEmptyRow(instructorsBody, 4, 'Nenhum instrutor cadastrado.');
            return;
        }
        const rows = instructors.map(instructor => {
            const row = document.createElement('tr');
            addCell(row, instructor.fullName);
            addCell(row, instructor.email);
            addCell(row, instructor.status);
            addCell(row, formatDate(instructor.createdAt, { dateStyle: 'short' }));
            return row;
        });
        instructorsBody.replaceChildren(...rows);
    }

    function fillSelect(select, items, placeholder, getLabel) {
        select.replaceChildren();
        const firstOption = document.createElement('option');
        firstOption.value = '';
        firstOption.textContent = placeholder;
        select.append(firstOption);
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = getLabel(item);
            select.append(option);
        });
    }

    async function loadMembershipOptions() {
        const { students, plans } = await apiRequest('/api/admin/memberships/options');
        const studentsWithoutActivePlan = students.filter(student => !student.activePlanName);
        fillSelect(
            membershipStudentSelect,
            studentsWithoutActivePlan,
            studentsWithoutActivePlan.length ? 'Selecione um aluno' : 'Todos os alunos já têm plano ativo',
            student => `${student.fullName || 'Aluno'}${student.email ? ` · ${student.email}` : ''}`
        );
        fillSelect(
            membershipPlanSelect,
            plans,
            plans.length ? 'Selecione um plano' : 'Nenhum plano ativo cadastrado',
            plan => `${plan.name} — ${formatCurrency(plan.price)} / ${plan.billing_interval}`
        );
        membershipSubmit.disabled = !studentsWithoutActivePlan.length || !plans.length;
    }

    function renderMemberships(memberships) {
        if (!memberships.length) {
            addEmptyRow(membershipsBody, 6, 'Nenhum plano foi atribuído a alunos ainda.');
            return;
        }

        const rows = memberships.map(membership => {
            const row = document.createElement('tr');
            const student = Array.isArray(membership.student) ? membership.student[0] : membership.student;
            const plan = Array.isArray(membership.plan) ? membership.plan[0] : membership.plan;
            addCell(row, student?.full_name || 'Aluno');
            addCell(row, plan?.name || 'Plano');
            addCell(row, formatCurrency(membership.price_at_purchase));
            addCell(row, membership.status.charAt(0).toUpperCase() + membership.status.slice(1));
            addCell(row, formatDate(`${membership.starts_on}T12:00:00`, { dateStyle: 'short' }));
            addCell(row, membership.ends_on
                ? formatDate(`${membership.ends_on}T12:00:00`, { dateStyle: 'short' })
                : 'Sem data definida');
            return row;
        });
        membershipsBody.replaceChildren(...rows);
    }

    async function loadMemberships() {
        const { memberships } = await apiRequest('/api/admin/memberships');
        renderMemberships(memberships);
    }

    // Preenche as listas com o que já existe no banco.
    async function loadCatalog() {
        catalog = await apiRequest('/api/admin/catalog');
        fillSelect(modalitySelect, catalog.modalities, 'Selecione uma modalidade', modality => modality.name);
        fillSelect(classSelect, catalog.classes, 'Selecione uma aula', item => item.name);
        fillSelect(instructorSelect, catalog.instructors, 'Selecione um instrutor', item => item.full_name || 'Instrutor');
    }

    // Envia convite de instrutor e atualiza o painel sem recarregar a página.
    inviteForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = inviteForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            const result = await apiRequest('/api/admin/instructors/invite', {
                method: 'POST',
                body: JSON.stringify({
                    name: document.getElementById('instructor-name').value.trim(),
                    email: document.getElementById('instructor-email').value.trim()
                })
            });
            showMessage(result.message);
            inviteForm.reset();
            await loadCatalog();
            await Promise.all([loadInstructors(), loadDashboard()]);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            submit.disabled = false;
        }
    });

    membershipForm.addEventListener('submit', async event => {
        event.preventDefault();
        membershipSubmit.disabled = true;
        try {
            const result = await apiRequest('/api/admin/memberships', {
                method: 'POST',
                body: JSON.stringify({
                    studentId: membershipStudentSelect.value,
                    planId: membershipPlanSelect.value
                })
            });
            showMessage(result.message);
            membershipForm.reset();
            await Promise.all([loadMembershipOptions(), loadMemberships()]);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            membershipSubmit.disabled = !membershipStudentSelect.value || !membershipPlanSelect.value;
        }
    });

    // Cria a ficha da aula para depois ela poder receber horários.
    classForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = classForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            await apiRequest('/api/admin/classes', {
                method: 'POST',
                body: JSON.stringify({
                    modalityId: modalitySelect.value,
                    name: document.getElementById('class-name').value.trim(),
                    level: document.getElementById('class-level').value.trim(),
                    durationMinutes: Number(document.getElementById('class-duration').value),
                    location: document.getElementById('class-location').value.trim(),
                    capacity: Number(document.getElementById('class-capacity').value)
                })
            });
            showMessage('Aula cadastrada. Agora você já pode agendar um horário para ela.');
            classForm.reset();
            document.getElementById('class-level').value = 'Todos os níveis';
            document.getElementById('class-duration').value = '60';
            document.getElementById('class-capacity').value = '20';
            await loadCatalog();
            await loadDashboard();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            submit.disabled = false;
        }
    });

    // Agenda um horário e liga a sessão ao instrutor escolhido.
    sessionForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = sessionForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            await apiRequest('/api/admin/sessions', {
                method: 'POST',
                body: JSON.stringify({
                    classId: classSelect.value,
                    instructorId: instructorSelect.value,
                    startsAt: new Date(document.getElementById('session-start').value).toISOString()
                })
            });
            showMessage('Aula agendada e instrutor relacionado. Os alunos já podem reservar a vaga.');
            sessionForm.reset();
            await loadDashboard();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            submit.disabled = false;
        }
    });

    document.getElementById('refresh-dashboard').addEventListener('click', () => {
        loadDashboard().catch(error => showMessage(error.message, 'error'));
    });
    document.getElementById('refresh-instructors').addEventListener('click', () => {
        loadInstructors().catch(error => showMessage(error.message, 'error'));
    });
    document.getElementById('refresh-memberships').addEventListener('click', () => {
        Promise.all([loadMembershipOptions(), loadMemberships()])
            .catch(error => showMessage(error.message, 'error'));
    });

    document.querySelectorAll('.sidebar-nav a[href^="#"]').forEach(link => {
        link.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => item.classList.toggle('active', item === link));
        });
    });

    // Atualiza tudo ao abrir e renova os dados de tempos em tempos.
    Promise.all([loadCatalog(), loadMembershipOptions(), loadMemberships()])
        .then(() => Promise.all([loadDashboard(), loadInstructors()]))
        .catch(error => {
            console.error('Falha ao carregar o painel administrativo.', error);
            showMessage(error.message, 'error');
            addEmptyRow(sessionsBody, 4, 'Não foi possível carregar as aulas.');
            addEmptyRow(reservationsBody, 4, 'Não foi possível carregar as reservas.');
            addEmptyRow(instructorsBody, 4, 'Não foi possível carregar os instrutores.');
            addEmptyRow(membershipsBody, 6, 'Não foi possível carregar os planos dos alunos.');
        });

    const startInput = document.getElementById('session-start');
    const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    startInput.min = localNow;

    window.setInterval(() => {
        loadDashboard().catch(error => console.error('Falha ao atualizar o dashboard.', error));
        if (window.location.hash === '#relatorios-admin') {
            window.carregarRelatorios?.();
        }
    }, 30_000);
});


// --- 1. Variáveis de Controle ---
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const sections = document.querySelectorAll('.admin-view');
    let instanciaChartModalidade = null;
    let instanciaChartFrequencia = null;
    let carregandoRelatorios = false;

    // --- 2. Função de Gráficos e Relatórios ---
    async function carregarRelatorios() {
        if (carregandoRelatorios) return;
        carregandoRelatorios = true;
        if (!window.adminApiRequest && document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        }

        try {
            if (!window.adminApiRequest) throw new Error('A sessão administrativa ainda não está pronta. Atualize a página e tente novamente.');
            const dados = await window.adminApiRequest('/api/admin/reports');

            const ctxModalidade = document.getElementById('chartModalidade');
            if (ctxModalidade) {
                if (instanciaChartModalidade) {
                    instanciaChartModalidade.data.labels = dados.modality.labels;
                    instanciaChartModalidade.data.datasets[0].data = dados.modality.values;
                    instanciaChartModalidade.update();
                } else {
                    instanciaChartModalidade = new Chart(ctxModalidade, {
                        type: 'doughnut',
                        data: {
                            labels: dados.modality.labels,
                            datasets: [{
                                data: dados.modality.values,
                                backgroundColor: ['#e63946', '#1d3557', '#457b9d', '#f4a261'],
                                borderWidth: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom' } }
                        }
                    });
                }
            }

            const ctxFrequencia = document.getElementById('graficoFrequencia');
            if (ctxFrequencia) {
                if (instanciaChartFrequencia) {
                    instanciaChartFrequencia.data.labels = dados.weeklyAttendance.labels;
                    instanciaChartFrequencia.data.datasets[0].data = dados.weeklyAttendance.expected;
                    instanciaChartFrequencia.data.datasets[1].data = dados.weeklyAttendance.present;
                    instanciaChartFrequencia.update();
                } else {
                    instanciaChartFrequencia = new Chart(ctxFrequencia, {
                        type: 'bar',
                        data: {
                            labels: dados.weeklyAttendance.labels,
                            datasets: [
                                {
                                    label: 'Alunos Esperados',
                                    data: dados.weeklyAttendance.expected,
                                    backgroundColor: '#457b9d',
                                    borderRadius: 6
                                },
                                {
                                    label: 'Alunos Presentes',
                                    data: dados.weeklyAttendance.present,
                                    backgroundColor: '#e63946',
                                    borderRadius: 6
                                }
                            ]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: true, position: 'bottom' },
                                tooltip: { mode: 'index', intersect: false }
                            },
                            scales: { y: { beginAtZero: true } }
                        }
                    });
                }
            }

            const listaAusenciasEl = document.querySelector('.lista-ausencias');
            if (listaAusenciasEl) {
                if (!dados.absences.length) {
                    const emptyItem = document.createElement('li');
                    emptyItem.className = 'ausencia-item';
                    emptyItem.textContent = 'Nenhuma ausência crítica registrada neste mês.';
                    listaAusenciasEl.replaceChildren(emptyItem);
                } else {
                    const items = dados.absences.map(aluno => {
                        const item = document.createElement('li');
                        item.className = 'ausencia-item';
                        const info = document.createElement('div');
                        info.className = 'aluno-info';
                        const name = document.createElement('span');
                        name.className = 'aluno-nome';
                        name.textContent = aluno.studentName;
                        const plan = document.createElement('span');
                        plan.className = 'aluno-plano';
                        plan.textContent = aluno.planName;
                        info.append(name, plan);

                        const absences = document.createElement('div');
                        absences.className = 'aluno-faltas';
                        const count = document.createElement('span');
                        count.className = 'faltas-num';
                        count.textContent = `${aluno.count} faltas`;
                        const period = document.createElement('span');
                        period.className = 'faltas-mes';
                        period.textContent = 'neste mês';
                        absences.append(count, period);
                        item.append(info, absences);
                        return item;
                    });
                    listaAusenciasEl.replaceChildren(...items);
                }
            }
        } catch (error) {
            console.error('Falha ao carregar os relatórios administrativos.', error);
            const message = document.getElementById('admin-message');
            if (message) {
                message.textContent = error.message;
                message.dataset.type = 'error';
                message.hidden = false;
            }
        } finally {
            carregandoRelatorios = false;
        }
    }
    window.carregarRelatorios = carregarRelatorios;

    // --- 3. Função de Navegação entre Seções ---
    function ativarSecao(sectionId) {
        sections.forEach(section => {
            section.style.display = (`#${section.id}` === sectionId) ? '' : 'none';
        });

        navItems.forEach(item => {
            const isSelected = item.getAttribute('href') === sectionId;
            item.classList.toggle('active', isSelected);

            if (isSelected) {
                item.setAttribute('aria-current', 'page');
            } else {
                item.removeAttribute('aria-current');
            }
        });

        if (sectionId === '#relatorios-admin') {
            carregarRelatorios();
        }
    }

    // --- 4. Eventos de Clique e Histórico ---
    navItems.forEach(item => {
        item.addEventListener('click', (event) => {
            event.preventDefault();
            const targetId = item.getAttribute('href');

            ativarSecao(targetId);
            history.pushState(null, '', targetId);
        });
    });

    window.addEventListener('popstate', () => {
        ativarSecao(window.location.hash || '#dashboard');
    });

    // --- 5. Inicialização ---
    ativarSecao(window.location.hash || '#dashboard');
