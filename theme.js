(() => {
	function applyTheme(enabled) {
		document.documentElement.classList.toggle('dark-mode', enabled);
	}
	applyTheme(localStorage.getItem('darkMode') === 'true');
	window.addEventListener('storage', event => {
		if (event.key === 'darkMode' || event.key === null) applyTheme(localStorage.getItem('darkMode') === 'true');
	});
	document.addEventListener('change', event => {
		if (event.target.getAttribute('preference') === 'darkMode') applyTheme(event.target.checked);
	}, true);
})();
