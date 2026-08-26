import axios from 'axios';

export default {
    namespaced: true,
    state: {
        user: null,
        loading: false
    },
    getters: {
        isAuthenticated(state) {
            return !!state.user;
        },
        user(state) {
            return state.user;
        }
    },
    mutations: {
        SET_USER(state, user) {
            state.user = user;
        },
        SET_LOADING(state, status) {
            state.loading = status;
        }
    },
    actions: {
        async login({ commit }, credentials) {
            commit('SET_LOADING', true);
            try {
                await axios.get('/sanctum/csrf-cookie');
                await axios.post('/login', credentials);
                const { data } = await axios.get('/api/user');
                commit('SET_USER', data);
                return true;
            } catch (error) {
                return false;
            } finally {
                commit('SET_LOADING', false);
            }
        },
        async logout({ commit }) {
            await axios.post('/logout');
            commit('SET_USER', null);
        },
        async fetchUser({ commit }) {
            try {
                const { data } = await axios.get('/api/user');
                commit('SET_USER', data);
            } catch (e) {
                commit('SET_USER', null);
            }
        }
    }
};
