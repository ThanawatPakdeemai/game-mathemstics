import { useCallback, useEffect, useState } from 'react';
import { socket, emitAsync } from '../lib/socket.js';
import { withOffset } from '../lib/time.js';
import { ConnectionBanner, MathBackdrop, Toast } from '../components/ui.jsx';
import SetupScreen from './SetupScreen.jsx';
import LobbyScreen from './LobbyScreen.jsx';
import { CountdownScreen, QuestionScreen, RevealScreen } from './GameScreens.jsx';
import FinishedScreen from './FinishedScreen.jsx';

const SESSION_KEY = 'mathmotion-host';

const loadSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
};
const saveSession = (s) => {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
};

export default function HostApp() {
  const [state, setState] = useState(null); // { view, offset }
  const [resuming, setResuming] = useState(() => Boolean(loadSession()));
  const [toast, setToast] = useState('');

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  useEffect(() => {
    const onState = (view) => setState(withOffset(view));
    const resume = async () => {
      const session = loadSession();
      if (!session) return setResuming(false);
      const res = await emitAsync('host:resume', session);
      if (res.error) {
        saveSession(null);
        setState(null);
      }
      setResuming(false);
    };
    socket.on('state', onState);
    socket.on('connect', resume);
    if (socket.connected) resume();
    return () => {
      socket.off('state', onState);
      socket.off('connect', resume);
    };
  }, []);

  const action = useCallback(
    async (event, payload) => {
      const res = await emitAsync(event, payload);
      if (res.error) notify(res.error);
      return res;
    },
    [notify],
  );

  const createRoom = async (settings) => {
    const res = await action('host:create', settings);
    if (!res.error) saveSession({ roomId: res.roomId, hostToken: res.hostToken });
  };

  const leave = async (cancel) => {
    if (cancel) await action('host:cancel');
    else await action('host:leave');
    saveSession(null);
    setState(null);
  };

  const view = state?.view;
  let screen;
  if (resuming) screen = <div className="center-screen loading">กำลังโหลด…</div>;
  else if (!view || view.status === 'closed') screen = <SetupScreen onCreate={createRoom} />;
  else {
    const props = { view, offset: state.offset, action, onLeave: leave };
    switch (view.status) {
      case 'lobby':
        screen = <LobbyScreen {...props} />;
        break;
      case 'countdown':
        screen = <CountdownScreen {...props} />;
        break;
      case 'question':
        screen = <QuestionScreen {...props} />;
        break;
      case 'reveal':
        screen = <RevealScreen {...props} />;
        break;
      case 'finished':
        screen = <FinishedScreen {...props} />;
        break;
      default:
        screen = <SetupScreen onCreate={createRoom} />;
    }
  }

  return (
    <div className="app host">
      <MathBackdrop />
      <ConnectionBanner />
      {screen}
      <Toast message={toast} />
    </div>
  );
}
