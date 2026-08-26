<template>
    <div class="container mt-5">
        <div class="row justify-content-center">
            <div class="col-md-5">
                <div class="card shadow border-0 rounded-lg">
                    <div class="card-header bg-white text-center py-4 border-0">
                        <h3 class="font-weight-light my-2 text-primary fw-bold">POS System</h3>
                        <p class="text-muted small mb-0">Faça login para acessar o sistema</p>
                    </div>
                    <div class="card-body p-4">
                        <ValidationObserver v-slot="{ handleSubmit }">
                            <form @submit.prevent="handleSubmit(submit)">
                                <div class="mb-3">
                                    <ValidationProvider name="Email" rules="required|email" v-slot="{ errors }">
                                        <label class="small mb-1" for="email">E-mail</label>
                                        <input class="form-control" :class="{'is-invalid': errors[0]}" id="email" type="email" v-model="form.email" placeholder="Digite seu e-mail" />
                                        <span class="invalid-feedback">{{ errors[0] }}</span>
                                    </ValidationProvider>
                                </div>
                                <div class="mb-4">
                                    <ValidationProvider name="Senha" rules="required" v-slot="{ errors }">
                                        <label class="small mb-1" for="password">Senha</label>
                                        <input class="form-control" :class="{'is-invalid': errors[0]}" id="password" type="password" v-model="form.password" placeholder="Digite sua senha" />
                                        <span class="invalid-feedback">{{ errors[0] }}</span>
                                    </ValidationProvider>
                                </div>
                                <div class="d-flex align-items-center justify-content-between mt-4 mb-0">
                                    <button class="btn btn-primary w-100 py-2" type="submit" :disabled="loading">
                                        <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                        Entrar
                                    </button>
                                </div>
                            </form>
                        </ValidationObserver>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            form: {
                email: '',
                password: ''
            }
        };
    },
    computed: {
        loading() {
            return this.$store.state.auth.loading;
        }
    },
    methods: {
        async submit() {
            const success = await this.$store.dispatch('auth/login', this.form);
            if (success) {
                this.$router.push('/dashboard');
            } else {
                alert('Credenciais inválidas!');
            }
        }
    }
}
</script>

<style scoped>
.card {
    border-radius: 1rem;
}
.btn-primary {
    background: linear-gradient(135deg, #0d6efd 0%, #0a58ca 100%);
    border: none;
    font-weight: 600;
}
.btn-primary:hover {
    background: linear-gradient(135deg, #0b5ed7 0%, #094eb3 100%);
}
</style>
