(() => {
	const isBackground = location.pathname === '/modern-background.html';
	if (isBackground) {
		localStorage.setItem('application.tab.opinions.enabled', 'false');
		localStorage.setItem('application.context-menu.enabled', 'false');
		if (!localStorage.getItem('modern.defaults.8.22.3.5')) {
			localStorage.setItem('allAccountsCounter', 'false');
			localStorage.setItem('modern.defaults.8.22.3.5', 'true');
		}
	}
	const send = chrome.runtime.sendMessage.bind(chrome.runtime);
	chrome.runtime.sendMessage = (...args) => {
		const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
		const promise = send(...args);
		promise.then(response => callback?.(response), error => {
			if (!/Receiving end does not exist|message port closed|message channel closed/i.test(error.message)) console.warn('Яндекс Почта:', error.message);
			callback?.();
		});
		return promise;
	};
	function storedOption(name) {
		const raw = localStorage.getItem(name) ?? localStorage.getItem(name + ':default');
		try { return JSON.parse(raw); } catch { return undefined; }
	}
	let background;
	chrome.extension ||= {};
	chrome.extension.getBackgroundPage = () => isBackground ? window : background;
	chrome.runtime.getBackgroundPage = callback => {
		if (isBackground) {
			const wait = () => window.api ? callback(window) : setTimeout(wait, 50);
			wait();
			return;
		}
		send({target:'mail-worker', bridge:'snapshot'}).then(snapshot => {
			if (!snapshot || snapshot.error) throw Error(snapshot?.error || 'Фоновая проверка недоступна');
			background = {XMLHttpRequest, WebSocket, api:{
				options:{get:storedOption, set:(name, value) => send({target:'mail-background', bridge:'option', name, value})},
				i18n:{locale:snapshot.locale, getString:key => key}, branding:{getId:() => snapshot.branding}, config:{getUI:() => snapshot.ui},
				logger:{log:() => {}, error:console.error}, notify:{},
				navigate:(url, target) => target === 'new window' ? chrome.windows.create({url}) : chrome.tabs.create({url}),
				openSettings:() => chrome.runtime.openOptionsPage(),
				getCurrentTabUrl:callback => chrome.tabs.query({active:true, currentWindow:true}, tabs => callback(tabs[0]?.url || '')),
				isCurrentWindowMinimized:callback => chrome.windows.getCurrent(window => callback(window.state === 'minimized')),
				sendClickerStatistics:() => {},
				cookie:{get:(domain, name, path, httpOnly, callback, context) => chrome.cookies.getAll({domain, name, ...(path ? {path} : {})}, cookies => {
					const cookie = cookies.find(cookie => cookie.httpOnly === httpOnly);
					if (cookie) callback.call(context, cookie.value);
				})}
			}};
			callback(background);
		}).catch(error => {
			console.error('Яндекс Почта:', error);
			const showError = () => { document.body.textContent = 'Не удалось запустить проверку почты. Обновите расширение на странице управления расширениями.'; };
			document.body ? showError() : document.addEventListener('DOMContentLoaded', showError);
		});
	};
})();
