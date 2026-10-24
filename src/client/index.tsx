import './styles.css';
import { definePterodactylExtension } from '@pterodactyl/sdk';
import ConsoleMods from './ConsoleMods';

export default definePterodactylExtension({
    setup({ screens, slots }) {
        screens.register('main', () => import('./screens/ServerScreen'));
        screens.register('admin', () => import('./screens/AdminScreen'));
        slots.register('server.console.after', ConsoleMods);
    },
});
