require('./bootstrap');

import Vue from 'vue';
import VueRouter from 'vue-router';
import store from './store';
import routes from './routes';
import AppComponent from './components/AppComponent.vue';

// VeeValidate
import { ValidationProvider, ValidationObserver, extend } from 'vee-validate';
import { required, email, numeric, min_value } from 'vee-validate/dist/rules';

extend('required', required);
extend('email', email);
extend('numeric', numeric);
extend('min_value', min_value);

Vue.component('ValidationProvider', ValidationProvider);
Vue.component('ValidationObserver', ValidationObserver);

Vue.use(VueRouter);

const router = new VueRouter({
    mode: 'history',
    routes
});

// Setup navigation guards
router.beforeEach((to, from, next) => {
    const isAuthenticated = store.getters['auth/isAuthenticated'];
    
    if (to.meta.requiresAuth && !isAuthenticated) {
        next('/login');
    } else if (to.path === '/login' && isAuthenticated) {
        next('/dashboard');
    } else {
        next();
    }
});

Vue.component('app-component', AppComponent);

const app = new Vue({
    el: '#app',
    router,
    store,
    created() {
        // Automatically fetch user if token exists (handled by session cookie natively or just checking if we can fetch user)
        this.$store.dispatch('auth/fetchUser');
    }
});
