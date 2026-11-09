(() => {
	chrome.runtime.getManifest = () => MAIL_MANIFEST;
	chrome.runtime.getURL ||= path => new URL(path, location.origin + '/').href;
	const language = navigator.language.split('-')[0];
	const locale = MAIL_LOCALES[language] ? language : MAIL_MANIFEST.default_locale;
	chrome.i18n = {
		getUILanguage:() => locale,
		getMessage:(key, substitutions = []) => {
			if (key === '@@ui_locale') return locale;
			if (key === '@@extension_id') return location.host;
			let message = MAIL_LOCALES[locale][key]?.message || '';
			for (const [index, value] of [substitutions].flat().entries()) message = message.replaceAll('$' + (index + 1), value);
			return message;
		}
	};
	const send = chrome.runtime.sendMessage.bind(chrome.runtime);
	const listeners = new Map();
	function request(path, args, callback) {
		const promise = send({target:'mail-worker', bridge:'api', path, args}).then(response => {
			if (response?.error) throw Error(response.error);
			return response?.value;
		});
		if (!callback) return promise;
		promise.then(value => callback(value), error => {
			Object.defineProperty(chrome.runtime, 'lastError', {configurable:true, value:{message:error.message}});
			try { callback(); } finally { delete chrome.runtime.lastError; }
		});
	}
	function event(path) {
		const entries = new Map();
		listeners.set(path, entries);
		return {addListener:(callback, filter) => entries.set(callback, filter), removeListener:callback => entries.delete(callback), hasListener:callback => entries.has(callback), hasListeners:() => Boolean(entries.size)};
	}
	const methods = {
		action:['getTitle','setTitle','setIcon','getPopup','setPopup','getBadgeText','setBadgeText','getBadgeBackgroundColor','setBadgeBackgroundColor','enable','disable'],
		cookies:['get','getAll','set','remove'], management:['get','getAll','getSelf','uninstall'],
		tabs:['create','get','query','update','reload','remove','sendMessage'],
		windows:['create','get','getAll','getCurrent','getLastFocused','update','remove'],
		notifications:['create','clear','getAll','getPermissionLevel','update'], webNavigation:[], webRequest:[]
	};
	for (const [namespace, names] of Object.entries(methods)) {
		chrome[namespace] = {};
		for (const name of names) chrome[namespace][name] = (...args) => {
			const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
			const promise = request(namespace + '.' + name, args, callback);
			if (!callback) promise.catch(error => console.warn('Яндекс Почта:', namespace + '.' + name, error.message));
			return promise;
		};
	}
	for (const path of MAIL_EVENTS) {
		const [namespace, name] = path.split('.');
		chrome[namespace][name] = event(path);
	}
	chrome.runtime.onMessageExternal = event('runtime.onMessageExternal');
	chrome.extension = {inIncognitoContext:false, getBackgroundPage:() => window};
	chrome.runtime.onMessage.addListener((message, sender, reply) => {
		if (sender.id !== chrome.runtime.id || message.target !== 'mail-background') return;

		if (message.bridge === 'event') {
			for (const [callback, filter] of listeners.get(message.path) || []) {
				const details = message.args[0];
				const matches = pattern => {
					if (pattern === '<all_urls>') return true;
					const expression = pattern.split('*').map(part => [...part].map(character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')).join('')).join('.*');
					return new RegExp('^' + expression + '$').test(details.url);
				};
				if (filter?.urls && !filter.urls.some(matches)) continue;
				if (filter?.types && !filter.types.includes(details.type)) continue;
				if (filter?.url && !filter.url.some(rule => !rule.urlPrefix || details.url.startsWith(rule.urlPrefix))) continue;
				callback(...message.args);
			}
			return;
		}
		if (message.bridge === 'snapshot') {
			const started = Date.now();
			const wait = () => {
				if (window.api?._adapter) return reply({locale:api.i18n.locale, branding:api.branding.getId(), ui:api.config.getUI()});
				if (Date.now() - started > 20000) return reply({error:'Не удалось запустить фоновую проверку почты'});
				setTimeout(wait, 50);
			};
			wait();
			return true;
		}
		if (message.bridge === 'option') { api.options.set(message.name, message.value); reply(true); }
	});
})();


