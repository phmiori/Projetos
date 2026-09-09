import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registrarTokenPushExpo, removerTokenPushExpo } from '../api/notificacoes';

/**
 * src/utils/pushNotifications.js
 * Pede permissão, gera o token de push do Expo e registra no backend (mesmo mecanismo do
 * botão "Ativar notificações push" do site, só que via serviço do Expo em vez de Web Push).
 *
 * IMPORTANTE: notificações push remotas não funcionam no Expo Go (Android, desde o SDK 53) —
 * só num development build gerado com EAS. Em Expo Go isso sempre retorna um erro tratado
 * abaixo, sem quebrar o app.
 */
export async function ativarNotificacoesPush() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }

  const permissaoAtual = await Notifications.getPermissionsAsync();
  let status = permissaoAtual.status;
  if (status !== 'granted') {
    const solicitada = await Notifications.requestPermissionsAsync();
    status = solicitada.status;
  }
  if (status !== 'granted') {
    throw new Error('Permissão de notificações negada.');
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  await registrarTokenPushExpo(token);
  return token;
}

export async function desativarNotificacoesPush() {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await removerTokenPushExpo(token);
}
