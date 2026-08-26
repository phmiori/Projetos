<template>
    <div class="container">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2 class="fw-bold text-dark mb-0">Clientes</h2>
            <button class="btn btn-primary shadow-sm" @click="openCreateModal">
                <i class="fas fa-plus me-1"></i> Novo Cliente
            </button>
        </div>

        <div class="card shadow-sm border-0 rounded-4">
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th class="border-0 px-4 py-3">Nome</th>
                                <th class="border-0 py-3">E-mail</th>
                                <th class="border-0 py-3">Telefone</th>
                                <th class="border-0 text-end px-4 py-3">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="customer in customers" :key="customer.id">
                                <td class="px-4 py-3 fw-medium">{{ customer.name }}</td>
                                <td>{{ customer.email || '-' }}</td>
                                <td>{{ customer.phone || '-' }}</td>
                                <td class="text-end px-4">
                                    <button class="btn btn-sm btn-outline-primary me-2" @click="editCustomer(customer)">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-danger" @click="deleteCustomer(customer.id)">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>
                            <tr v-if="customers.length === 0">
                                <td colspan="4" class="text-center py-5 text-muted">
                                    Nenhum cliente cadastrado.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Modal -->
        <div class="modal fade" id="customerModal" tabindex="-1" aria-hidden="true" ref="customerModal">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header border-bottom-0 pt-4 pb-0 px-4">
                        <h5 class="modal-title fw-bold">{{ editMode ? 'Editar Cliente' : 'Novo Cliente' }}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <ValidationObserver v-slot="{ handleSubmit }">
                        <form @submit.prevent="handleSubmit(saveCustomer)">
                            <div class="modal-body p-4">
                                <div class="mb-3">
                                    <ValidationProvider name="Nome" rules="required" v-slot="{ errors }">
                                        <label class="form-label text-muted small fw-bold">NOME</label>
                                        <input type="text" class="form-control" :class="{'is-invalid': errors[0]}" v-model="form.name">
                                        <span class="invalid-feedback">{{ errors[0] }}</span>
                                    </ValidationProvider>
                                </div>
                                <div class="mb-3">
                                    <ValidationProvider name="E-mail" rules="email" v-slot="{ errors }">
                                        <label class="form-label text-muted small fw-bold">E-MAIL</label>
                                        <input type="email" class="form-control" :class="{'is-invalid': errors[0]}" v-model="form.email">
                                        <span class="invalid-feedback">{{ errors[0] }}</span>
                                    </ValidationProvider>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label text-muted small fw-bold">TELEFONE</label>
                                    <input type="text" class="form-control" v-model="form.phone">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label text-muted small fw-bold">ENDEREÇO</label>
                                    <textarea class="form-control" v-model="form.address" rows="3"></textarea>
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
            customers: [],
            editMode: false,
            modalInstance: null,
            form: {
                id: '',
                name: '',
                email: '',
                phone: '',
                address: ''
            }
        };
    },
    mounted() {
        this.fetchCustomers();
        this.modalInstance = new Modal(this.$refs.customerModal);
    },
    methods: {
        async fetchCustomers() {
            const { data } = await axios.get('/api/customers');
            this.customers = data;
        },
        openCreateModal() {
            this.editMode = false;
            this.form = { id: '', name: '', email: '', phone: '', address: '' };
            this.modalInstance.show();
        },
        editCustomer(customer) {
            this.editMode = true;
            this.form = { ...customer };
            this.modalInstance.show();
        },
        async saveCustomer() {
            try {
                if (this.editMode) {
                    await axios.put(`/api/customers/${this.form.id}`, this.form);
                } else {
                    await axios.post('/api/customers', this.form);
                }
                this.modalInstance.hide();
                this.fetchCustomers();
            } catch (error) {
                console.error(error);
                alert('Erro ao salvar cliente.');
            }
        },
        async deleteCustomer(id) {
            if (confirm('Tem certeza que deseja excluir este cliente?')) {
                try {
                    await axios.delete(`/api/customers/${id}`);
                    this.fetchCustomers();
                } catch (error) {
                    console.error(error);
                    alert('Erro ao excluir cliente.');
                }
            }
        }
    }
}
</script>
