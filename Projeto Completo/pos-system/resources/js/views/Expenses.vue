<template>
    <div class="container">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2 class="fw-bold text-dark mb-0">Despesas</h2>
            <button class="btn btn-primary shadow-sm" @click="openCreateModal">
                <i class="fas fa-plus me-1"></i> Nova Despesa
            </button>
        </div>

        <div class="card shadow-sm border-0 rounded-4">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th class="border-0 px-4 py-3">Descrição</th>
                                <th class="border-0 py-3">Data</th>
                                <th class="border-0 py-3">Valor</th>
                                <th class="border-0 text-end px-4 py-3">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="expense in expenses" :key="expense.id">
                                <td class="px-4 py-3 fw-medium">{{ expense.description }}</td>
                                <td>{{ formatDate(expense.date) }}</td>
                                <td class="fw-bold text-danger">R$ {{ formatCurrency(expense.amount) }}</td>
                                <td class="text-end px-4">
                                    <button class="btn btn-sm btn-outline-primary me-2" @click="editExpense(expense)">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" @click="deleteExpense(expense.id)">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                            <tr v-if="expenses.length === 0">
                                <td colspan="4" class="text-center py-5 text-muted">
                                    Nenhuma despesa cadastrada.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Modal -->
        <div class="modal fade" id="expenseModal" tabindex="-1" aria-hidden="true" ref="expenseModal">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header border-bottom-0 pt-4 pb-0 px-4">
                        <h5 class="modal-title fw-bold">{{ editMode ? 'Editar Despesa' : 'Nova Despesa' }}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <ValidationObserver v-slot="{ handleSubmit }">
                        <form @submit.prevent="handleSubmit(saveExpense)">
                            <div class="modal-body p-4">
                                <div class="mb-3">
                                    <ValidationProvider name="Descrição" rules="required" v-slot="{ errors }">
                                        <label class="form-label text-muted small fw-bold">DESCRIÇÃO</label>
                                        <input type="text" class="form-control" :class="{'is-invalid': errors[0]}" v-model="form.description">
                                        <span class="invalid-feedback">{{ errors[0] }}</span>
                                    </ValidationProvider>
                                </div>
                                <div class="mb-3">
                                    <ValidationProvider name="Valor" rules="required|min_value:0.01" v-slot="{ errors }">
                                        <label class="form-label text-muted small fw-bold">VALOR (R$)</label>
                                        <input type="number" step="0.01" class="form-control" :class="{'is-invalid': errors[0]}" v-model="form.amount">
                                        <span class="invalid-feedback">{{ errors[0] }}</span>
                                    </ValidationProvider>
                                </div>
                                <div class="mb-3">
                                    <ValidationProvider name="Data" rules="required" v-slot="{ errors }">
                                        <label class="form-label text-muted small fw-bold">DATA</label>
                                        <input type="date" class="form-control" :class="{'is-invalid': errors[0]}" v-model="form.date">
                                        <span class="invalid-feedback">{{ errors[0] }}</span>
                                    </ValidationProvider>
                                </div>
                            </div>
                            <div class="modal-footer border-top-0 px-4 pb-4">
                                <button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button>
                                <button type="submit" class="btn btn-primary px-4">Salvar</button>
                            </div>
                        </form>
                    </ValidationObserver>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import axios from 'axios';
import { Modal } from 'bootstrap';

export default {
    data() {
        return {
            expenses: [],
            editMode: false,
            modalInstance: null,
            form: {
                id: '',
                description: '',
                amount: '',
                date: ''
            }
        };
    },
    mounted() {
        this.fetchExpenses();
        this.modalInstance = new Modal(this.$refs.expenseModal);
    },
    methods: {
        async fetchExpenses() {
            const { data } = await axios.get('/api/expenses');
            this.expenses = data;
        },
        openCreateModal() {
            this.editMode = false;
            this.form = { id: '', description: '', amount: '', date: new Date().toISOString().slice(0, 10) };
            this.modalInstance.show();
        },
        editExpense(expense) {
            this.editMode = true;
            this.form = { ...expense };
            this.modalInstance.show();
        },
        async saveExpense() {
            try {
                if (this.editMode) {
                    await axios.put(`/api/expenses/${this.form.id}`, this.form);
                } else {
                    await axios.post('/api/expenses', this.form);
                }
                this.modalInstance.hide();
                this.fetchExpenses();
            } catch (error) {
                console.error(error);
                alert('Erro ao salvar despesa.');
            }
        },
        async deleteExpense(id) {
            if (confirm('Tem certeza que deseja excluir esta despesa?')) {
                try {
                    await axios.delete(`/api/expenses/${id}`);
                    this.fetchExpenses();
                } catch (error) {
                    console.error(error);
                    alert('Erro ao excluir despesa.');
                }
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
