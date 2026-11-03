import { Game } from './game/Game';
import './improvements.css';
import './style.css';
import './responsive.css';
import './compact.css';
import './menu.css';
import './conversation.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Не найден игровой контейнер');
new Game(app);
