<template>
    <div class="container">
        <h2 class="mb-4 fw-bold text-dark">Dashboard</h2>
        
        <div class="row g-4 mb-4">
            <div class="col-xl-4 col-md-6">
                <div class="card bg-primary text-white h-100 shadow-sm border-0 rounded-4 dashboard-card">
                    <div class="card-body py-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="text-white-50 text-uppercase fw-bold mb-1">Total de Clientes</h6>
                                <h2 class="mb-0 fw-bold">{{ metrics.total_customers }}</h2>
                            </div>
                            <div class="icon-box bg-white bg-opacity-25 rounded-circle p-3">
                                <i class="fas fa-users fa-fw fa-lg"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-xl-4 col-md-6">
                <div class="card bg-success text-white h-100 shadow-sm border-0 rounded-4 dashboard-card">
                    <div class="card-body py-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="text-white-50 text-uppercase fw-bold mb-1">Despesas do Mês</h6>
                                <h2 class="mb-0 fw-bold">R$ {{ formatCurrency(metrics.current_month_expenses) }}</h2>
                            </div>
                            <div class="icon-box bg-white bg-opacity-25 rounded-circle p-3">
                                <i class="fas fa-calendar-alt fa-fw fa-lg"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="col-xl-4 col-md-6">
                <div class="card bg-danger text-white h-100 shadow-sm border-0 rounded-4 dashboard-card">
                    <div class="card-body py-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h6 class="text-white-50 text-uppercase fw-bold mb-1">Total de Despesas</h6>
                                <h2 class="mb-0 fw-bold">R$ {{ formatCurrency(metrics.total_expenses) }}</h2>
                            </div>
                            <div class="icon-box bg-white bg-opacity-25 rounded-circle p-3">
                                <i class="fas fa-money-bill-wave fa-fw fa-lg"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card shadow-sm border-0 rounded-4">
            <div class="card-header bg-white py-3 border-bottom-0">
                <h5 class="mb-0 fw-bold text-dark">Últimas Despesas</h5>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th class="border-0 px-4">Descrição</th>
                                <th class="border-0">Data</th>
                                <th class="border-0 text-end px-4">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="expense in metrics.recent_expenses" :key="expense.id">
                                <td class="px-4 py-3">{{ expense.description }}</td>
                                <td>{{ formatDate(expense.date) }}</td>
                                <td class="text-end px-4 fw-bold text-danger">R$ {{ formatCurrency(expense.amount) }}</td>
                            </tr>
                            <tr v-if="!metrics.recent_expenses || metrics.recent_expenses.length === 0">
                                <td colspan="3" class="text-center py-4 text-muted">Nenhuma despesa recente encontrada.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import axios from 'axios';

export default {
    data() {
        return {
            metrics: {
                total_customers: 0,
                total_expenses: 0,
                current_month_expenses: 0,
                recent_expenses: []
            }
        };
    },
    mounted() {
        this.fetchDashboardData();
    },
    methods: {
        async fetchDashboardData() {
            try {
                const { data } = await axios.get('/api/dashboard');
                this.metrics = data;
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            }
        },
        formatCurrency(value) {
            return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        },
        formatDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString('pt-BR');
        }
    }
}
</script>

<style scoped>
.dashboard-card {
    transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.dashboard-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 20px rgba(0,0,0,0.1) !important;
}
.icon-box {
    width: 60px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>
