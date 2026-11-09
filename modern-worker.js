importScripts('offscreen-config.js');
const backgroundPath = 'modern-background.html';
let creatingBackground;
async function ensureBackground() {
	if (creatingBackground) return creatingBackground;
	creatingBackground = (async () => {
		const url = chrome.runtime.getURL(backgroundPath);
		const contexts = await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'], documentUrls:[url]});
		if (!contexts.length) await chrome.offscreen.createDocument({url:backgroundPath, reasons:['LOCAL_STORAGE','DOM_PARSER','IFRAME_SCRIPTING','BLOBS'], justification:'Хранение настроек почты, разбор XML-ответов, авторизация через iframe и подготовка локальных данных.'});
	})();
	try { await creatingBackground; } finally { creatingBackground = null; }
}
async function startBackground() {
	const tabs = await chrome.tabs.query({url:chrome.runtime.getURL(backgroundPath)});
	if (tabs.length) await chrome.tabs.remove(tabs.map(tab => tab.id));
	await ensureBackground();
}
const allowedMethods = new Set(MAIL_METHODS);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
	if (sender.id !== chrome.runtime.id || message.target !== 'mail-worker') return;
	(async () => {
		if (message.bridge === 'api') {
			if (sender.url !== chrome.runtime.getURL(backgroundPath) || !allowedMethods.has(message.path)) throw Error('Недопустимый вызов API');
			const [namespace, method] = message.path.split('.');
			return {value:await chrome[namespace][method](...message.args)};
		}
		await ensureBackground();
		if (message.bridge === 'snapshot') return chrome.runtime.sendMessage({target:'mail-background', bridge:'snapshot'});
		return {value:true};
	})().then(reply, error => reply({error:error.message}));
	return true;
});
for (const path of MAIL_EVENTS) {
	const [namespace, name] = path.split('.');
	const listener = (...args) => {
		ensureBackground().then(() => chrome.runtime.sendMessage({target:'mail-background', bridge:'event', path, args})).catch(error => console.warn('Яндекс Почта:', error.message));
	};
	if (namespace === 'webRequest') chrome[namespace][name].addListener(listener, {urls:['<all_urls>']});
	else chrome[namespace][name].addListener(listener);
}
chrome.runtime.onInstalled.addListener(() => startBackground().catch(console.error));
chrome.runtime.onStartup.addListener(() => startBackground().catch(console.error));
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'mail-background') ensureBackground().catch(console.error); });
chrome.alarms.create('mail-background', {periodInMinutes:1});
