document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Navegação SPA (Abas do Sidebar) - Igual ao do aluno
    const navItems = document.querySelectorAll('.nav-item[data-target]');
    const views = document.querySelectorAll('.view-section');

    function switchView(targetId) {
        navItems.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-target="${targetId}"]`).classList.add('active');

        views.forEach(view => {
            view.classList.remove('active');
            if(view.id === targetId) {
                view.classList.add('active');
            }
        });
        window.scrollTo(0, 0);
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.getAttribute('data-target'));
        });
    });

    // 2. Atalhos para a tela de Chamada (Presenças)
    const goToChamadaBtns = document.querySelectorAll('.btn-go-chamada');
    goToChamadaBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchView('view-presencas');
        });
    });

    // 3. Lógica Funcional de Realizar a Chamada
    const botoesChamada = document.querySelectorAll('.btn-chamada');
    
    botoesChamada.forEach(btn => {
        btn.addEventListener('click', function() {
            // Pega o grupo de botões do aluno atual (a linha da tabela)
            const parentRow = this.closest('tr');
            const btnsNaLinha = parentRow.querySelectorAll('.btn-chamada');
            
            // Remove a classe 'active' de todos os botões daquela linha
            btnsNaLinha.forEach(b => b.classList.remove('active'));
            
            // Ativa apenas o botão clicado
            this.classList.add('active');
        });
    });

    // Lógica para salvar a chamada
    const btnSalvarChamada = document.getElementById('btn-salvar-chamada');
    if(btnSalvarChamada) {
        btnSalvarChamada.addEventListener('click', () => {
            // Verifica se todos os alunos receberam um status
            const totalAlunos = document.querySelectorAll('#tabela-chamada tbody tr').length;
            const alunosAvaliados = document.querySelectorAll('#tabela-chamada tbody tr .btn-chamada.active').length;

            if(alunosAvaliados < totalAlunos) {
                alert("Atenção: Por favor, marque presença ou falta para todos os alunos antes de salvar.");
            } else {
                alert("Chamada salva com sucesso!");
                switchView('view-dashboard');
            }
        });
    }
});


/*ABA RELATÓRIOS*/
// Configurações comuns para as fontes e cores das grades
Chart.defaults.font.family = "'Archivo', sans-serif";
Chart.defaults.color = '#6b7280'; // Cor dos textos dos eixos

const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false } // Esconde a legenda padrão na maioria
    },
    scales: {
        x: {
            grid: { display: false }, // Sem linhas verticais
            border: { display: false }
        },
        y: {
            border: { display: false },
            grid: {
                color: '#f3f4f6', // Cor das linhas horizontais (claras)
                drawTicks: false,
            },
            ticks: {
                padding: 10
            }
        }
    }
};

// 1. Ocupação por turma (%)
const ctxOcupacao = document.getElementById('chartOcupacao').getContext('2d');
new Chart(ctxOcupacao, {
    type: 'bar', // Tipo de gráfico (pode mudar para 'line' se preferir)
    data: {
        labels: ['Boxe', 'Muay', 'Jiu-Jítsu', 'Funcional', 'Kickboxing'],
        datasets: [{
            data: [], // Gráfico vazio
            backgroundColor: '#ffc933' // Cor de preenchimento futuro
        }]
    },
    options: {
        ...commonOptions,
        scales: {
            ...commonOptions.scales,
            y: {
                ...commonOptions.scales.y,
                min: 0,
                max: 100,
                ticks: { stepSize: 25 }
            }
        }
    }
});

// 2. Presenças por dia da semana
const ctxPresencas = document.getElementById('chartPresencas').getContext('2d');
new Chart(ctxPresencas, {
    type: 'bar',
    data: {
        labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
        datasets: [{
            data: [], // Gráfico vazio
            backgroundColor: '#ffc933'
        }]
    },
    options: {
        ...commonOptions,
        scales: {
            ...commonOptions.scales,
            y: {
                ...commonOptions.scales.y,
                min: 0,
                max: 60,
                ticks: { stepSize: 15 }
            }
        }
    }
});

// 3. Alunos por modalidade
const ctxModalidade = document.getElementById('chartModalidade').getContext('2d');
new Chart(ctxModalidade, {
    type: 'bar',
    data: {
        labels: ['Boxe', 'Muay', 'Jiu-Jítsu', 'Funcional', 'Kickboxing'],
        datasets: [{
            data: [], // Gráfico vazio
        }]
    },
    options: {
        ...commonOptions,
        plugins: {
            legend: {
                display: true, // Mostra a legenda neste gráfico
                position: 'bottom',
                align: 'start',
                labels: {
                    usePointStyle: true, // Bolinhas na legenda
                    boxWidth: 8
                }
            }
        },
        scales: {
            ...commonOptions.scales,
            y: {
                ...commonOptions.scales.y,
                min: 0,
                max: 100,
                ticks: { stepSize: 25 }
            }
        }
    }
});
