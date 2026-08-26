import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import Customers from './views/Customers.vue';
import Expenses from './views/Expenses.vue';

export default [
    {
        path: '/',
        redirect: '/dashboard'
    },
    {
        path: '/login',
        name: 'login',
        component: Login,
        meta: { requiresAuth: false }
    },
    {
        path: '/dashboard',
        name: 'dashboard',
        component: Dashboard,
        meta: { requiresAuth: true }
    },
    {
        path: '/customers',
        name: 'customers',
        component: Customers,
        meta: { requiresAuth: true }
    },
    {
        path: '/expenses',
        name: 'expenses',
        component: Expenses,
        meta: { requiresAuth: true }
    }
];
