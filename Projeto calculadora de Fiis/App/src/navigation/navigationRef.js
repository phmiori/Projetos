import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navegarPara(rota) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(rota);
  }
}
