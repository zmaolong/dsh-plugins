window.__ModuleLoader__.load({
	id: "dsh-remote-ctrl",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/client/locales.ts
		/**
		* Dictionary namespace of the Remote Control dialog and its 8-language
		* dictionaries (language ids lowercase). `zh` is the key-set authority; every
		* other language carries the same keys. Placeholders use `{name}` templates.
		*
		* @module dsh-remote-ctrl/client/locales
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "remoteCtrl";
		/** All dictionaries keyed by lowercase language id. */
		const dictionaries = {
			zh: {
				title: "远程控制",
				subtitle: "局域网网关：手机扫码即得完整 DSH Web UI",
				running: "运行中",
				stopped: "未运行",
				enabledTag: "已启用",
				disabledTag: "已停用",
				start: "启动",
				stop: "停止",
				stoppedHint: "已停止：手机暂时无法访问；重启宿主后仍保持停止状态。",
				clients: "已连接设备 {count} 台",
				qrTitle: "手机扫码连接",
				qrHint: "扫码打开的是完整、自适应的 DSH Web UI（会话、审批、提问全部原生能力）；配对码已包含在链接里。",
				copyLink: "复制链接",
				copyLinkDesc: "复制当前选中地址的完整链接，手机浏览器直接打开即可。",
				addresses: "局域网地址",
				addressesDesc: "手机与电脑需在同一局域网；选择手机可达的地址，二维码与复制链接会随之切换。",
				recommended: "推荐",
				scopePrivate: "私网",
				scopePublic: "公网",
				scopeLinkLocal: "链路本地",
				copy: "复制",
				copied: "已复制",
				tokenTitle: "配对码",
				tokenPermanent: "配对码长期有效，只有手动刷新才会更换。",
				tokenPinned: "配对码来自 cordis.patch.yml 的 config.token，面板里不能刷新。",
				refreshToken: "刷新配对码",
				refreshConfirm: "确认刷新（旧码立即失效）",
				cancel: "取消",
				securityHint: "请在可信局域网内使用；持有配对码即可查看会话、发送消息并批准工具调用。",
				upstreamMissing: "宿主 web 服务尚未就绪：网关已启动，等宿主就绪后刷新手机页面即可。",
				serverError: "服务启动失败",
				apiUnavailable: "面板数据面不可用",
				unknownError: "未知错误",
				apiHint: "面板数据来自宿主 webServer 的回环接口 /remote-ctrl/api；web profile 下应自动挂载。",
				retry: "重试",
				noAddress: "没有找到局域网地址（本机可能只有回环接口）。",
				close: "关闭"
			},
			en: {
				title: "Remote Control",
				subtitle: "LAN gateway: the full DSH web UI on your phone, one scan away",
				running: "Running",
				stopped: "Not running",
				enabledTag: "Enabled",
				disabledTag: "Disabled",
				start: "Start",
				stop: "Stop",
				stoppedHint: "Stopped: phones cannot reach this host; the state survives a restart.",
				clients: "{count} device(s) connected",
				qrTitle: "Scan to connect",
				qrHint: "What opens is the complete, responsive DSH web UI (sessions, approvals, questions are all native); the pairing token is already embedded.",
				copyLink: "Copy link",
				copyLinkDesc: "Copy the full link of the selected address and open it in the phone browser.",
				addresses: "LAN addresses",
				addressesDesc: "Phone and computer must share the LAN; pick an address the phone can reach — the QR code and copied link follow it.",
				recommended: "Recommended",
				scopePrivate: "Private",
				scopePublic: "Public",
				scopeLinkLocal: "Link-local",
				copy: "Copy",
				copied: "Copied",
				tokenTitle: "Pairing token",
				tokenPermanent: "The pairing token stays valid until you refresh it manually.",
				tokenPinned: "The token comes from config.token in cordis.patch.yml and cannot be refreshed here.",
				refreshToken: "Refresh token",
				refreshConfirm: "Confirm refresh (old token dies)",
				cancel: "Cancel",
				securityHint: "Use on a trusted LAN only; whoever holds the token can view sessions, send messages, and approve tool calls.",
				upstreamMissing: "The host web service is not ready yet: the gateway is up; refresh the phone page once the host is ready.",
				serverError: "Server failed to start",
				apiUnavailable: "Panel data plane unavailable",
				unknownError: "Unknown error",
				apiHint: "Panel data comes from the loopback endpoint /remote-ctrl/api of the host webServer; it should mount automatically in the web profile.",
				retry: "Retry",
				noAddress: "No LAN address found (this machine may only have loopback interfaces).",
				close: "Close"
			},
			ja: {
				title: "リモート操作",
				subtitle: "LAN ゲートウェイ：スキャンすれば完全な DSH Web UI を開く",
				running: "実行中",
				stopped: "停止中",
				enabledTag: "有効",
				disabledTag: "無効",
				start: "開始",
				stop: "停止",
				stoppedHint: "停止中：スマホからはアクセスできません。再起動後も停止を維持します。",
				clients: "接続中のデバイス {count} 台",
				qrTitle: "スマホでスキャンして接続",
				qrHint: "開くのは完全でレスポンシブな DSH Web UI（セッション・承認・質問はすべてネイティブ）。ペアリングコードはリンクに含まれています。",
				copyLink: "リンクをコピー",
				copyLinkDesc: "選択中のアドレスの完全なリンクをコピーします。スマホのブラウザで開けます。",
				addresses: "LAN アドレス",
				addressesDesc: "スマホと PC を同じ LAN に接続し、スマホから到達できるアドレスを選んでください。QR コードとコピーするリンクが切り替わります。",
				recommended: "推奨",
				scopePrivate: "プライベート",
				scopePublic: "パブリック",
				scopeLinkLocal: "リンクローカル",
				copy: "コピー",
				copied: "コピーしました",
				tokenTitle: "ペアリングコード",
				tokenPermanent: "ペアリングコードは手動で更新するまで有効です。",
				tokenPinned: "コードは cordis.patch.yml の config.token 由来のため、ここでは更新できません。",
				refreshToken: "ペアリングコードを更新",
				refreshConfirm: "更新する（古いコードは即無効）",
				cancel: "キャンセル",
				securityHint: "信頼できる LAN でのみ使用してください。コードを知っている人はセッションの閲覧・送信・承認ができます。",
				upstreamMissing: "ホストの Web サービスがまだ準備できていません：ゲートウェイは起動済み。準備できたらスマホのページを再読込してください。",
				serverError: "サーバーの起動に失敗しました",
				apiUnavailable: "パネルのデータ面を利用できません",
				unknownError: "不明なエラー",
				apiHint: "パネルのデータはホスト webServer のループバック API /remote-ctrl/api から取得します。web プロファイルでは自動でマウントされます。",
				retry: "再試行",
				noAddress: "LAN アドレスが見つかりません（ループバックのみの可能性）。",
				close: "閉じる"
			},
			es: {
				title: "Control remoto",
				subtitle: "Pasarela LAN: la web completa de DSH en tu teléfono, con un escaneo",
				running: "En ejecución",
				stopped: "Detenido",
				enabledTag: "Activado",
				disabledTag: "Desactivado",
				start: "Iniciar",
				stop: "Detener",
				stoppedHint: "Detenido: los teléfonos no pueden acceder; el estado se mantiene tras reiniciar.",
				clients: "{count} dispositivo(s) conectados",
				qrTitle: "Escanea para conectar",
				qrHint: "Se abre la web completa y adaptable de DSH (sesiones, aprobaciones y preguntas son nativas); el token de emparejamiento ya está incluido.",
				copyLink: "Copiar enlace",
				copyLinkDesc: "Copia el enlace completo de la dirección seleccionada; ábrelo en el navegador del teléfono.",
				addresses: "Direcciones LAN",
				addressesDesc: "El teléfono y el equipo deben estar en la misma LAN; elige una dirección alcanzable: el QR y el enlace copiado cambian con ella.",
				recommended: "Recomendada",
				scopePrivate: "Privada",
				scopePublic: "Pública",
				scopeLinkLocal: "Enlace local",
				copy: "Copiar",
				copied: "Copiado",
				tokenTitle: "Token de emparejamiento",
				tokenPermanent: "El token de emparejamiento sigue válido hasta que lo renueves manualmente.",
				tokenPinned: "El token viene de config.token en cordis.patch.yml y no se puede renovar aquí.",
				refreshToken: "Renovar token",
				refreshConfirm: "Confirmar (el token anterior deja de valer)",
				cancel: "Cancelar",
				securityHint: "Úsalo solo en una LAN confiable; quien tenga el token puede ver sesiones, enviar mensajes y aprobar llamadas.",
				upstreamMissing: "El servicio web del host aún no está listo: la pasarela ya está activa; recarga la página del teléfono cuando el host esté listo.",
				serverError: "El servidor no pudo iniciarse",
				apiUnavailable: "Plano de datos del panel no disponible",
				unknownError: "Error desconocido",
				apiHint: "Los datos del panel provienen del endpoint de bucle /remote-ctrl/api del webServer del host; en el perfil web se monta automáticamente.",
				retry: "Reintentar",
				noAddress: "No se encontró dirección LAN (quizá solo hay interfaces de bucle).",
				close: "Cerrar"
			},
			fr: {
				title: "Télécommande",
				subtitle: "Passerelle LAN : la web UI DSH complète sur votre téléphone, en un scan",
				running: "En cours",
				stopped: "Arrêté",
				enabledTag: "Activé",
				disabledTag: "Désactivé",
				start: "Démarrer",
				stop: "Arrêter",
				stoppedHint: "Arrêté : les téléphones ne peuvent pas accéder ; l’état est conservé après redémarrage.",
				clients: "{count} appareil(s) connecté(s)",
				qrTitle: "Scannez pour connecter",
				qrHint: "La web UI DSH complète et adaptative s’ouvre (sessions, approbations, questions sont natives) ; le jeton d’appariement est déjà inclus.",
				copyLink: "Copier le lien",
				copyLinkDesc: "Copie le lien complet de l’adresse sélectionnée ; ouvrez-le dans le navigateur du téléphone.",
				addresses: "Adresses LAN",
				addressesDesc: "Le téléphone et l’ordinateur doivent être sur le même LAN ; choisissez une adresse joignable : le QR code et le lien copié suivent.",
				recommended: "Recommandée",
				scopePrivate: "Privée",
				scopePublic: "Publique",
				scopeLinkLocal: "Lien local",
				copy: "Copier",
				copied: "Copié",
				tokenTitle: "Jeton d’appariement",
				tokenPermanent: "Le jeton d’appariement reste valide jusqu’à un renouvellement manuel.",
				tokenPinned: "Le jeton vient de config.token dans cordis.patch.yml et ne peut pas être renouvelé ici.",
				refreshToken: "Renouveler le jeton",
				refreshConfirm: "Confirmer (l’ancien jeton expire)",
				cancel: "Annuler",
				securityHint: "À utiliser sur un LAN de confiance ; qui détient le jeton peut voir les sessions, envoyer des messages et approuver des appels.",
				upstreamMissing: "Le service web de l’hôte n’est pas prêt : la passerelle est active; rechargez la page du téléphone une fois l’hôte prêt.",
				serverError: "Échec du démarrage du serveur",
				apiUnavailable: "Plan de données du panneau indisponible",
				unknownError: "Erreur inconnue",
				apiHint: "Les données du panneau proviennent de l’endpoint boucle /remote-ctrl/api du webServer de l’hôte ; il se monte automatiquement en profil web.",
				retry: "Réessayer",
				noAddress: "Aucune adresse LAN trouvée (cette machine n’a peut-être que des interfaces boucle).",
				close: "Fermer"
			},
			de: {
				title: "Fernsteuerung",
				subtitle: "LAN-Gateway: die komplette DSH-Web-UI auf dem Handy, ein Scan genügt",
				running: "Läuft",
				stopped: "Gestoppt",
				enabledTag: "Aktiv",
				disabledTag: "Inaktiv",
				start: "Starten",
				stop: "Stoppen",
				stoppedHint: "Gestoppt: Handys erreichen diesen Host nicht; der Zustand bleibt nach einem Neustart erhalten.",
				clients: "{count} Gerät(e) verbunden",
				qrTitle: "Zum Verbinden scannen",
				qrHint: "Es öffnet sich die komplette, adaptive DSH-Web-UI (Sitzungen, Genehmigungen, Fragen sind nativ); das Kopplungstoken ist bereits enthalten.",
				copyLink: "Link kopieren",
				copyLinkDesc: "Kopiert den vollständigen Link der gewählten Adresse; im Handy-Browser öffnen.",
				addresses: "LAN-Adressen",
				addressesDesc: "Handy und Rechner müssen im selben LAN sein; wähle eine erreichbare Adresse – QR-Code und kopierter Link folgen ihr.",
				recommended: "Empfohlen",
				scopePrivate: "Privat",
				scopePublic: "Öffentlich",
				scopeLinkLocal: "Link-lokal",
				copy: "Kopieren",
				copied: "Kopiert",
				tokenTitle: "Kopplungstoken",
				tokenPermanent: "Das Kopplungstoken bleibt gültig, bis du es manuell erneuerst.",
				tokenPinned: "Das Token stammt aus config.token in cordis.patch.yml und kann hier nicht erneuert werden.",
				refreshToken: "Token erneuern",
				refreshConfirm: "Bestätigen (alter Token wird ungültig)",
				cancel: "Abbrechen",
				securityHint: "Nur in einem vertrauenswürdigen LAN verwenden; wer das Token hat, kann Sitzungen sehen, Nachrichten senden und Aufrufe genehmigen.",
				upstreamMissing: "Der Webdienst des Hosts ist noch nicht bereit: Das Gateway läuft; lade die Handyseite neu, sobald der Host bereit ist.",
				serverError: "Serverstart fehlgeschlagen",
				apiUnavailable: "Datenquelle des Panels nicht verfügbar",
				unknownError: "Unbekannter Fehler",
				apiHint: "Die Panel-Daten kommen vom Loopback-Endpunkt /remote-ctrl/api des Host-Webservers; im Web-Profil wird er automatisch eingebunden.",
				retry: "Erneut versuchen",
				noAddress: "Keine LAN-Adresse gefunden (nur Loopback-Schnittstellen?).",
				close: "Schließen"
			},
			ru: {
				title: "Дистанционное управление",
				subtitle: "Шлюз LAN: полный веб-интерфейс DSH на телефоне по одному сканированию",
				running: "Работает",
				stopped: "Остановлен",
				enabledTag: "Включено",
				disabledTag: "Выключено",
				start: "Запустить",
				stop: "Остановить",
				stoppedHint: "Остановлено: телефоны не имеют доступа; состояние сохраняется после перезапуска.",
				clients: "Подключено устройств: {count}",
				qrTitle: "Сканируйте для подключения",
				qrHint: "Откроется полный адаптивный веб-интерфейс DSH (сеансы, одобрения, вопросы — всё нативно); код сопряжения уже в ссылке.",
				copyLink: "Копировать ссылку",
				copyLinkDesc: "Копирует полную ссылку выбранного адреса; откройте её в браузере телефона.",
				addresses: "LAN-адреса",
				addressesDesc: "Телефон и компьютер должны быть в одной сети; выберите доступный адрес — QR-код и ссылка переключатся вместе с ним.",
				recommended: "Рекомендуется",
				scopePrivate: "Частный",
				scopePublic: "Публичный",
				scopeLinkLocal: "Link-local",
				copy: "Копировать",
				copied: "Скопировано",
				tokenTitle: "Код сопряжения",
				tokenPermanent: "Код сопряжения действует, пока вы не обновите его вручную.",
				tokenPinned: "Код задан через config.token в cordis.patch.yml и не обновляется здесь.",
				refreshToken: "Обновить код",
				refreshConfirm: "Подтвердить (старый код сразу перестанет работать)",
				cancel: "Отмена",
				securityHint: "Используйте только в доверенной сети: владелец кода может видеть сеансы, писать и одобрять вызовы.",
				upstreamMissing: "Веб-служба хоста ещё не готова: шлюз работает; обновите страницу телефона, когда хост будет готов.",
				serverError: "Не удалось запустить сервер",
				apiUnavailable: "Панель данных недоступна",
				unknownError: "Неизвестная ошибка",
				apiHint: "Данные панели приходят с loopback-эндпоинта /remote-ctrl/api веб-сервера хоста; в профиле web он подключается автоматически.",
				retry: "Повторить",
				noAddress: "LAN-адреса не найдены (возможно, только loopback-интерфейсы).",
				close: "Закрыть"
			},
			pt: {
				title: "Controle remoto",
				subtitle: "Gateway LAN: a web UI completa do DSH no celular, com um escaneio",
				running: "Em execução",
				stopped: "Parado",
				enabledTag: "Ativado",
				disabledTag: "Desativado",
				start: "Iniciar",
				stop: "Parar",
				stoppedHint: "Parado: os celulares não conseguem acessar; o estado é mantido após reiniciar.",
				clients: "{count} dispositivo(s) conectado(s)",
				qrTitle: "Escaneie para conectar",
				qrHint: "Abre a web UI completa e adaptável do DSH (sessões, aprovações e perguntas são nativas); o token de pareamento já está no link.",
				copyLink: "Copiar link",
				copyLinkDesc: "Copia o link completo do endereço selecionado; abra no navegador do celular.",
				addresses: "Endereços LAN",
				addressesDesc: "Celular e computador precisam estar na mesma LAN; escolha um endereço alcançável — o QR e o link copiado acompanham.",
				recommended: "Recomendado",
				scopePrivate: "Privado",
				scopePublic: "Público",
				scopeLinkLocal: "Link local",
				copy: "Copiar",
				copied: "Copiado",
				tokenTitle: "Token de pareamento",
				tokenPermanent: "O token de pareamento continua válido até você renová-lo manualmente.",
				tokenPinned: "O token vem de config.token no cordis.patch.yml e não pode ser renovado aqui.",
				refreshToken: "Renovar token",
				refreshConfirm: "Confirmar (o token antigo expira)",
				cancel: "Cancelar",
				securityHint: "Use apenas em uma LAN confiável; quem tem o token pode ver sessões, enviar mensagens e aprovar chamadas.",
				upstreamMissing: "O serviço web do host ainda não está pronto: o gateway já está ativo; recarregue a página do celular quando o host estiver pronto.",
				serverError: "Falha ao iniciar o servidor",
				apiUnavailable: "Plano de dados do painel indisponível",
				unknownError: "Erro desconhecido",
				apiHint: "Os dados do painel vêm do endpoint de loopback /remote-ctrl/api do webServer do host; no perfil web ele é montado automaticamente.",
				retry: "Tentar novamente",
				noAddress: "Nenhum endereço LAN encontrado (apenas interfaces de loopback?).",
				close: "Fechar"
			}
		};
		// src/client/api.ts
		/** Envelope error carrying the host's stable code. */
		var ApiError = class extends Error {
			code;
			constructor(message, code) {
				super(message);
				this.name = "ApiError";
				this.code = code;
			}
		};
		const API_BASE = "/remote-ctrl/api";
		/** Call one panel API endpoint and return its `data`. */
		async function api(path, options = {}) {
			const method = options.method ?? "GET";
			const timeoutMs = options.timeoutMs ?? 3e4;
			const init = {
				method,
				cache: "no-store",
				headers: { "content-type": "application/json" }
			};
			if (options.body !== void 0) init.body = JSON.stringify(options.body);
			if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(timeoutMs);
			const response = await fetch(`${API_BASE}${path}`, init);
			let payload = null;
			try {
				payload = await response.json();
			} catch {
				payload = null;
			}
			if (!response.ok || payload === null || payload.ok !== true) throw new ApiError(payload !== null && typeof payload.error === "string" ? payload.error : `HTTP ${response.status}`, payload !== null && typeof payload.code === "string" ? payload.code : "");
			return payload.data;
		}
		// src/client/store.ts
		/**
		* Client state of the desktop panel: a small snapshot-store engine (the
		* official `createSnapshotStore` shape — getSnapshot/subscribe, stable
		* snapshot references) plus the controller whose actions poll the panel
		* API and copy values. Components are pure props components: the slot
		* registration binds `hooks.remote` to a `useRemote` selector hook and
		* passes the action callbacks through the inject face.
		*
		* @module dsh-remote-ctrl/client/store
		*/
		/** Initial state before the first poll lands. */
		const initialPanelState = {
			status: "loading",
			error: "",
			data: null,
			copied: null,
			pending: false
		};
		/** Identity selector for `useRemote` when the whole snapshot is needed. */
		function identity(state) {
			return state;
		}
		const POLL_MS = 4e3;
		function createSnapshotStore(initial) {
			let snapshot = initial;
			const listeners = /* @__PURE__ */ new Set();
			const notify = () => {
				for (const listener of [...listeners]) listener();
			};
			return {
				store: {
					getSnapshot: () => snapshot,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					}
				},
				get: () => snapshot,
				update: (updater) => {
					const next = updater(snapshot);
					if (next === snapshot) return;
					snapshot = next;
					notify();
				}
			};
		}
		/** Copy text to the clipboard with a textarea fallback (non-secure contexts). */
		async function writeClipboard(value) {
			try {
				await navigator.clipboard.writeText(value);
				return true;
			} catch {
				try {
					const area = document.createElement("textarea");
					area.value = value;
					area.style.position = "fixed";
					area.style.opacity = "0";
					document.body.appendChild(area);
					area.select();
					const done = document.execCommand("copy");
					area.remove();
					return done;
				} catch {
					return false;
				}
			}
		}
		/** The panel controller: polling, copy feedback, teardown. */
		function createRemoteController() {
			const { store, get, update } = createSnapshotStore(initialPanelState);
			let timer = null;
			const load = async () => {
				try {
					const data = await api("/status");
					update((previous) => ({
						...previous,
						status: "ready",
						error: "",
						data
					}));
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					update((previous) => ({
						...previous,
						status: previous.data === null ? "error" : "ready",
						error: message
					}));
				}
			};
			const mutate = async (path) => {
				update((previous) => ({
					...previous,
					pending: true
				}));
				try {
					const data = await api(path, { method: "POST" });
					update((previous) => ({
						...previous,
						pending: false,
						status: "ready",
						error: "",
						data
					}));
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					update((previous) => ({
						...previous,
						pending: false,
						error: message
					}));
				}
			};
			return {
				store,
				actions: {
					init: () => {
						load();
						if (timer === null) timer = setInterval(() => {
							load();
						}, POLL_MS);
					},
					load: () => {
						load();
					},
					copy: async (value, key) => {
						if (!await writeClipboard(value)) return;
						update((previous) => ({
							...previous,
							copied: key
						}));
						setTimeout(() => {
							if (get().copied === key) update((previous) => ({
								...previous,
								copied: null
							}));
						}, 1500);
					},
					start: () => mutate("/start"),
					stop: () => mutate("/stop"),
					refreshToken: () => mutate("/token/refresh"),
					destroy: () => {
						if (timer !== null) {
							clearInterval(timer);
							timer = null;
						}
					}
				}
			};
		}
		// src/client/PanelIcon.tsx
		/** Render the Remote Control glyph. */
		function PanelIcon({ size, active }) {
			const edge = typeof size === "number" ? size : 20;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: Math.round(edge),
				height: Math.round(edge),
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: active === true ? 2 : 1.7,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				style: {
					display: "block",
					flex: "none"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "5",
					y: "2",
					width: "14",
					height: "20",
					rx: "2",
					ry: "2"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 18h.01" })]
			});
		}
		// src/client/qrcode.ts
		var qrcode = function() {
			/**
			* qrcode
			* @param typeNumber 1 to 40
			* @param errorCorrectionLevel 'L','M','Q','H'
			*/
			var qrcode = function(typeNumber, errorCorrectionLevel) {
				var PAD0 = 236;
				var PAD1 = 17;
				var _typeNumber = typeNumber;
				var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
				var _modules = null;
				var _moduleCount = 0;
				var _dataCache = null;
				var _dataList = [];
				var _this = {};
				var makeImpl = function(test, maskPattern) {
					_moduleCount = _typeNumber * 4 + 17;
					_modules = function(moduleCount) {
						var modules = new Array(moduleCount);
						for (var row = 0; row < moduleCount; row += 1) {
							modules[row] = new Array(moduleCount);
							for (var col = 0; col < moduleCount; col += 1) modules[row][col] = null;
						}
						return modules;
					}(_moduleCount);
					setupPositionProbePattern(0, 0);
					setupPositionProbePattern(_moduleCount - 7, 0);
					setupPositionProbePattern(0, _moduleCount - 7);
					setupPositionAdjustPattern();
					setupTimingPattern();
					setupTypeInfo(test, maskPattern);
					if (_typeNumber >= 7) setupTypeNumber(test);
					if (_dataCache == null) _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
					mapData(_dataCache, maskPattern);
				};
				var setupPositionProbePattern = function(row, col) {
					for (var r = -1; r <= 7; r += 1) {
						if (row + r <= -1 || _moduleCount <= row + r) continue;
						for (var c = -1; c <= 7; c += 1) {
							if (col + c <= -1 || _moduleCount <= col + c) continue;
							if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) _modules[row + r][col + c] = true;
							else _modules[row + r][col + c] = false;
						}
					}
				};
				var getBestMaskPattern = function() {
					var minLostPoint = 0;
					var pattern = 0;
					for (var i = 0; i < 8; i += 1) {
						makeImpl(true, i);
						var lostPoint = QRUtil.getLostPoint(_this);
						if (i == 0 || minLostPoint > lostPoint) {
							minLostPoint = lostPoint;
							pattern = i;
						}
					}
					return pattern;
				};
				var setupTimingPattern = function() {
					for (var r = 8; r < _moduleCount - 8; r += 1) {
						if (_modules[r][6] != null) continue;
						_modules[r][6] = r % 2 == 0;
					}
					for (var c = 8; c < _moduleCount - 8; c += 1) {
						if (_modules[6][c] != null) continue;
						_modules[6][c] = c % 2 == 0;
					}
				};
				var setupPositionAdjustPattern = function() {
					var pos = QRUtil.getPatternPosition(_typeNumber);
					for (var i = 0; i < pos.length; i += 1) for (var j = 0; j < pos.length; j += 1) {
						var row = pos[i];
						var col = pos[j];
						if (_modules[row][col] != null) continue;
						for (var r = -2; r <= 2; r += 1) for (var c = -2; c <= 2; c += 1) if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) _modules[row + r][col + c] = true;
						else _modules[row + r][col + c] = false;
					}
				};
				var setupTypeNumber = function(test) {
					var bits = QRUtil.getBCHTypeNumber(_typeNumber);
					for (var i = 0; i < 18; i += 1) {
						var mod = !test && (bits >> i & 1) == 1;
						_modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
					}
					for (var i = 0; i < 18; i += 1) {
						var mod = !test && (bits >> i & 1) == 1;
						_modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
					}
				};
				var setupTypeInfo = function(test, maskPattern) {
					var data = _errorCorrectionLevel << 3 | maskPattern;
					var bits = QRUtil.getBCHTypeInfo(data);
					for (var i = 0; i < 15; i += 1) {
						var mod = !test && (bits >> i & 1) == 1;
						if (i < 6) _modules[i][8] = mod;
						else if (i < 8) _modules[i + 1][8] = mod;
						else _modules[_moduleCount - 15 + i][8] = mod;
					}
					for (var i = 0; i < 15; i += 1) {
						var mod = !test && (bits >> i & 1) == 1;
						if (i < 8) _modules[8][_moduleCount - i - 1] = mod;
						else if (i < 9) _modules[8][15 - i - 1 + 1] = mod;
						else _modules[8][15 - i - 1] = mod;
					}
					_modules[_moduleCount - 8][8] = !test;
				};
				var mapData = function(data, maskPattern) {
					var inc = -1;
					var row = _moduleCount - 1;
					var bitIndex = 7;
					var byteIndex = 0;
					var maskFunc = QRUtil.getMaskFunction(maskPattern);
					for (var col = _moduleCount - 1; col > 0; col -= 2) {
						if (col == 6) col -= 1;
						while (true) {
							for (var c = 0; c < 2; c += 1) if (_modules[row][col - c] == null) {
								var dark = false;
								if (byteIndex < data.length) dark = (data[byteIndex] >>> bitIndex & 1) == 1;
								if (maskFunc(row, col - c)) dark = !dark;
								_modules[row][col - c] = dark;
								bitIndex -= 1;
								if (bitIndex == -1) {
									byteIndex += 1;
									bitIndex = 7;
								}
							}
							row += inc;
							if (row < 0 || _moduleCount <= row) {
								row -= inc;
								inc = -inc;
								break;
							}
						}
					}
				};
				var createBytes = function(buffer, rsBlocks) {
					var offset = 0;
					var maxDcCount = 0;
					var maxEcCount = 0;
					var dcdata = new Array(rsBlocks.length);
					var ecdata = new Array(rsBlocks.length);
					for (var r = 0; r < rsBlocks.length; r += 1) {
						var dcCount = rsBlocks[r].dataCount;
						var ecCount = rsBlocks[r].totalCount - dcCount;
						maxDcCount = Math.max(maxDcCount, dcCount);
						maxEcCount = Math.max(maxEcCount, ecCount);
						dcdata[r] = new Array(dcCount);
						for (var i = 0; i < dcdata[r].length; i += 1) dcdata[r][i] = 255 & buffer.getBuffer()[i + offset];
						offset += dcCount;
						var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
						var modPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1).mod(rsPoly);
						ecdata[r] = new Array(rsPoly.getLength() - 1);
						for (var i = 0; i < ecdata[r].length; i += 1) {
							var modIndex = i + modPoly.getLength() - ecdata[r].length;
							ecdata[r][i] = modIndex >= 0 ? modPoly.getAt(modIndex) : 0;
						}
					}
					var totalCodeCount = 0;
					for (var i = 0; i < rsBlocks.length; i += 1) totalCodeCount += rsBlocks[i].totalCount;
					var data = new Array(totalCodeCount);
					var index = 0;
					for (var i = 0; i < maxDcCount; i += 1) for (var r = 0; r < rsBlocks.length; r += 1) if (i < dcdata[r].length) {
						data[index] = dcdata[r][i];
						index += 1;
					}
					for (var i = 0; i < maxEcCount; i += 1) for (var r = 0; r < rsBlocks.length; r += 1) if (i < ecdata[r].length) {
						data[index] = ecdata[r][i];
						index += 1;
					}
					return data;
				};
				var createData = function(typeNumber, errorCorrectionLevel, dataList) {
					var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);
					var buffer = qrBitBuffer();
					for (var i = 0; i < dataList.length; i += 1) {
						var data = dataList[i];
						buffer.put(data.getMode(), 4);
						buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber));
						data.write(buffer);
					}
					var totalDataCount = 0;
					for (var i = 0; i < rsBlocks.length; i += 1) totalDataCount += rsBlocks[i].dataCount;
					if (buffer.getLengthInBits() > totalDataCount * 8) throw "code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")";
					if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
					while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
					while (true) {
						if (buffer.getLengthInBits() >= totalDataCount * 8) break;
						buffer.put(PAD0, 8);
						if (buffer.getLengthInBits() >= totalDataCount * 8) break;
						buffer.put(PAD1, 8);
					}
					return createBytes(buffer, rsBlocks);
				};
				_this.addData = function(data, mode) {
					mode = mode || "Byte";
					var newData = null;
					switch (mode) {
						case "Numeric":
							newData = qrNumber(data);
							break;
						case "Alphanumeric":
							newData = qrAlphaNum(data);
							break;
						case "Byte":
							newData = qr8BitByte(data);
							break;
						case "Kanji":
							newData = qrKanji(data);
							break;
						default: throw "mode:" + mode;
					}
					_dataList.push(newData);
					_dataCache = null;
				};
				_this.isDark = function(row, col) {
					if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) throw row + "," + col;
					return _modules[row][col];
				};
				_this.getModuleCount = function() {
					return _moduleCount;
				};
				_this.make = function() {
					if (_typeNumber < 1) {
						var typeNumber = 1;
						for (; typeNumber < 40; typeNumber++) {
							var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
							var buffer = qrBitBuffer();
							for (var i = 0; i < _dataList.length; i++) {
								var data = _dataList[i];
								buffer.put(data.getMode(), 4);
								buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber));
								data.write(buffer);
							}
							var totalDataCount = 0;
							for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
							if (buffer.getLengthInBits() <= totalDataCount * 8) break;
						}
						_typeNumber = typeNumber;
					}
					makeImpl(false, getBestMaskPattern());
				};
				_this.createTableTag = function(cellSize, margin) {
					cellSize = cellSize || 2;
					margin = typeof margin == "undefined" ? cellSize * 4 : margin;
					var qrHtml = "";
					qrHtml += "<table style=\"";
					qrHtml += " border-width: 0px; border-style: none;";
					qrHtml += " border-collapse: collapse;";
					qrHtml += " padding: 0px; margin: " + margin + "px;";
					qrHtml += "\">";
					qrHtml += "<tbody>";
					for (var r = 0; r < _this.getModuleCount(); r += 1) {
						qrHtml += "<tr>";
						for (var c = 0; c < _this.getModuleCount(); c += 1) {
							qrHtml += "<td style=\"";
							qrHtml += " border-width: 0px; border-style: none;";
							qrHtml += " border-collapse: collapse;";
							qrHtml += " padding: 0px; margin: 0px;";
							qrHtml += " width: " + cellSize + "px;";
							qrHtml += " height: " + cellSize + "px;";
							qrHtml += " background-color: ";
							qrHtml += _this.isDark(r, c) ? "#000000" : "#ffffff";
							qrHtml += ";";
							qrHtml += "\"/>";
						}
						qrHtml += "</tr>";
					}
					qrHtml += "</tbody>";
					qrHtml += "</table>";
					return qrHtml;
				};
				_this.createSvgTag = function(cellSize, margin, alt, title) {
					var opts = {};
					if (typeof arguments[0] == "object") {
						opts = arguments[0];
						cellSize = opts.cellSize;
						margin = opts.margin;
						alt = opts.alt;
						title = opts.title;
					}
					cellSize = cellSize || 2;
					margin = typeof margin == "undefined" ? cellSize * 4 : margin;
					alt = typeof alt === "string" ? { text: alt } : alt || {};
					alt.text = alt.text || null;
					alt.id = alt.text ? alt.id || "qrcode-description" : null;
					title = typeof title === "string" ? { text: title } : title || {};
					title.text = title.text || null;
					title.id = title.text ? title.id || "qrcode-title" : null;
					var size = _this.getModuleCount() * cellSize + margin * 2;
					var c, mc, r, mr, qrSvg = "", rect = "l" + cellSize + ",0 0," + cellSize + " -" + cellSize + ",0 0,-" + cellSize + "z ";
					qrSvg += "<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\"";
					qrSvg += !opts.scalable ? " width=\"" + size + "px\" height=\"" + size + "px\"" : "";
					qrSvg += " viewBox=\"0 0 " + size + " " + size + "\" ";
					qrSvg += " preserveAspectRatio=\"xMinYMin meet\"";
					qrSvg += title.text || alt.text ? " role=\"img\" aria-labelledby=\"" + escapeXml([title.id, alt.id].join(" ").trim()) + "\"" : "";
					qrSvg += ">";
					qrSvg += title.text ? "<title id=\"" + escapeXml(title.id) + "\">" + escapeXml(title.text) + "</title>" : "";
					qrSvg += alt.text ? "<description id=\"" + escapeXml(alt.id) + "\">" + escapeXml(alt.text) + "</description>" : "";
					qrSvg += "<rect width=\"100%\" height=\"100%\" fill=\"white\" cx=\"0\" cy=\"0\"/>";
					qrSvg += "<path d=\"";
					for (r = 0; r < _this.getModuleCount(); r += 1) {
						mr = r * cellSize + margin;
						for (c = 0; c < _this.getModuleCount(); c += 1) if (_this.isDark(r, c)) {
							mc = c * cellSize + margin;
							qrSvg += "M" + mc + "," + mr + rect;
						}
					}
					qrSvg += "\" stroke=\"transparent\" fill=\"black\"/>";
					qrSvg += "</svg>";
					return qrSvg;
				};
				_this.createDataURL = function(cellSize, margin) {
					cellSize = cellSize || 2;
					margin = typeof margin == "undefined" ? cellSize * 4 : margin;
					var size = _this.getModuleCount() * cellSize + margin * 2;
					var min = margin;
					var max = size - margin;
					return createDataURL(size, size, function(x, y) {
						if (min <= x && x < max && min <= y && y < max) {
							var c = Math.floor((x - min) / cellSize);
							var r = Math.floor((y - min) / cellSize);
							return _this.isDark(r, c) ? 0 : 1;
						} else return 1;
					});
				};
				_this.createImgTag = function(cellSize, margin, alt) {
					cellSize = cellSize || 2;
					margin = typeof margin == "undefined" ? cellSize * 4 : margin;
					var size = _this.getModuleCount() * cellSize + margin * 2;
					var img = "";
					img += "<img";
					img += " src=\"";
					img += _this.createDataURL(cellSize, margin);
					img += "\"";
					img += " width=\"";
					img += size;
					img += "\"";
					img += " height=\"";
					img += size;
					img += "\"";
					if (alt) {
						img += " alt=\"";
						img += escapeXml(alt);
						img += "\"";
					}
					img += "/>";
					return img;
				};
				var escapeXml = function(s) {
					var escaped = "";
					for (var i = 0; i < s.length; i += 1) {
						var c = s.charAt(i);
						switch (c) {
							case "<":
								escaped += "&lt;";
								break;
							case ">":
								escaped += "&gt;";
								break;
							case "&":
								escaped += "&amp;";
								break;
							case "\"":
								escaped += "&quot;";
								break;
							default: escaped += c;
						}
					}
					return escaped;
				};
				var _createHalfASCII = function(margin) {
					var cellSize = 1;
					margin = typeof margin == "undefined" ? cellSize * 2 : margin;
					var size = _this.getModuleCount() * cellSize + margin * 2;
					var min = margin;
					var max = size - margin;
					var y, x, r1, r2, p;
					var blocks = {
						"██": "█",
						"█ ": "▀",
						" █": "▄",
						"  ": " "
					};
					var blocksLastLineNoMargin = {
						"██": "▀",
						"█ ": "▀",
						" █": " ",
						"  ": " "
					};
					var ascii = "";
					for (y = 0; y < size; y += 2) {
						r1 = Math.floor((y - min) / cellSize);
						r2 = Math.floor((y + 1 - min) / cellSize);
						for (x = 0; x < size; x += 1) {
							p = "█";
							if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) p = " ";
							if (min <= x && x < max && min <= y + 1 && y + 1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) p += " ";
							else p += "█";
							ascii += margin < 1 && y + 1 >= max ? blocksLastLineNoMargin[p] : blocks[p];
						}
						ascii += "\n";
					}
					if (size % 2 && margin > 0) return ascii.substring(0, ascii.length - size - 1) + Array(size + 1).join("▀");
					return ascii.substring(0, ascii.length - 1);
				};
				_this.createASCII = function(cellSize, margin) {
					cellSize = cellSize || 1;
					if (cellSize < 2) return _createHalfASCII(margin);
					cellSize -= 1;
					margin = typeof margin == "undefined" ? cellSize * 2 : margin;
					var size = _this.getModuleCount() * cellSize + margin * 2;
					var min = margin;
					var max = size - margin;
					var y, x, r, p;
					var white = Array(cellSize + 1).join("██");
					var black = Array(cellSize + 1).join("  ");
					var ascii = "";
					var line = "";
					for (y = 0; y < size; y += 1) {
						r = Math.floor((y - min) / cellSize);
						line = "";
						for (x = 0; x < size; x += 1) {
							p = 1;
							if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) p = 0;
							line += p ? white : black;
						}
						for (r = 0; r < cellSize; r += 1) ascii += line + "\n";
					}
					return ascii.substring(0, ascii.length - 1);
				};
				_this.renderTo2dContext = function(context, cellSize) {
					cellSize = cellSize || 2;
					var length = _this.getModuleCount();
					for (var row = 0; row < length; row++) for (var col = 0; col < length; col++) {
						context.fillStyle = _this.isDark(row, col) ? "black" : "white";
						context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
					}
				};
				return _this;
			};
			qrcode.stringToBytesFuncs = { "default": function(s) {
				var bytes = [];
				for (var i = 0; i < s.length; i += 1) {
					var c = s.charCodeAt(i);
					bytes.push(c & 255);
				}
				return bytes;
			} };
			qrcode.stringToBytes = qrcode.stringToBytesFuncs["default"];
			/**
			* @param unicodeData base64 string of byte array.
			* [16bit Unicode],[16bit Bytes], ...
			* @param numChars
			*/
			qrcode.createStringToBytes = function(unicodeData, numChars) {
				var unicodeMap = function() {
					var bin = base64DecodeInputStream(unicodeData);
					var read = function() {
						var b = bin.read();
						if (b == -1) throw "eof";
						return b;
					};
					var count = 0;
					var unicodeMap = {};
					while (true) {
						var b0 = bin.read();
						if (b0 == -1) break;
						var b1 = read();
						var b2 = read();
						var b3 = read();
						var k = String.fromCharCode(b0 << 8 | b1);
						unicodeMap[k] = b2 << 8 | b3;
						count += 1;
					}
					if (count != numChars) throw count + " != " + numChars;
					return unicodeMap;
				}();
				var unknownChar = "?".charCodeAt(0);
				return function(s) {
					var bytes = [];
					for (var i = 0; i < s.length; i += 1) {
						var c = s.charCodeAt(i);
						if (c < 128) bytes.push(c);
						else {
							var b = unicodeMap[s.charAt(i)];
							if (typeof b == "number") {
								if ((b & 255) == b) bytes.push(b);
								else {
									bytes.push(b >>> 8);
									bytes.push(b & 255);
								}
							} else bytes.push(unknownChar);
						}
					}
					return bytes;
				};
			};
			var QRMode = {
				MODE_NUMBER: 1,
				MODE_ALPHA_NUM: 2,
				MODE_8BIT_BYTE: 4,
				MODE_KANJI: 8
			};
			var QRErrorCorrectionLevel = {
				L: 1,
				M: 0,
				Q: 3,
				H: 2
			};
			var QRMaskPattern = {
				PATTERN000: 0,
				PATTERN001: 1,
				PATTERN010: 2,
				PATTERN011: 3,
				PATTERN100: 4,
				PATTERN101: 5,
				PATTERN110: 6,
				PATTERN111: 7
			};
			var QRUtil = function() {
				var PATTERN_POSITION_TABLE = [
					[],
					[6, 18],
					[6, 22],
					[6, 26],
					[6, 30],
					[6, 34],
					[
						6,
						22,
						38
					],
					[
						6,
						24,
						42
					],
					[
						6,
						26,
						46
					],
					[
						6,
						28,
						50
					],
					[
						6,
						30,
						54
					],
					[
						6,
						32,
						58
					],
					[
						6,
						34,
						62
					],
					[
						6,
						26,
						46,
						66
					],
					[
						6,
						26,
						48,
						70
					],
					[
						6,
						26,
						50,
						74
					],
					[
						6,
						30,
						54,
						78
					],
					[
						6,
						30,
						56,
						82
					],
					[
						6,
						30,
						58,
						86
					],
					[
						6,
						34,
						62,
						90
					],
					[
						6,
						28,
						50,
						72,
						94
					],
					[
						6,
						26,
						50,
						74,
						98
					],
					[
						6,
						30,
						54,
						78,
						102
					],
					[
						6,
						28,
						54,
						80,
						106
					],
					[
						6,
						32,
						58,
						84,
						110
					],
					[
						6,
						30,
						58,
						86,
						114
					],
					[
						6,
						34,
						62,
						90,
						118
					],
					[
						6,
						26,
						50,
						74,
						98,
						122
					],
					[
						6,
						30,
						54,
						78,
						102,
						126
					],
					[
						6,
						26,
						52,
						78,
						104,
						130
					],
					[
						6,
						30,
						56,
						82,
						108,
						134
					],
					[
						6,
						34,
						60,
						86,
						112,
						138
					],
					[
						6,
						30,
						58,
						86,
						114,
						142
					],
					[
						6,
						34,
						62,
						90,
						118,
						146
					],
					[
						6,
						30,
						54,
						78,
						102,
						126,
						150
					],
					[
						6,
						24,
						50,
						76,
						102,
						128,
						154
					],
					[
						6,
						28,
						54,
						80,
						106,
						132,
						158
					],
					[
						6,
						32,
						58,
						84,
						110,
						136,
						162
					],
					[
						6,
						26,
						54,
						82,
						110,
						138,
						166
					],
					[
						6,
						30,
						58,
						86,
						114,
						142,
						170
					]
				];
				var G15 = 1335;
				var G18 = 7973;
				var G15_MASK = 21522;
				var _this = {};
				var getBCHDigit = function(data) {
					var digit = 0;
					while (data != 0) {
						digit += 1;
						data >>>= 1;
					}
					return digit;
				};
				_this.getBCHTypeInfo = function(data) {
					var d = data << 10;
					while (getBCHDigit(d) - getBCHDigit(G15) >= 0) d ^= G15 << getBCHDigit(d) - getBCHDigit(G15);
					return (data << 10 | d) ^ G15_MASK;
				};
				_this.getBCHTypeNumber = function(data) {
					var d = data << 12;
					while (getBCHDigit(d) - getBCHDigit(G18) >= 0) d ^= G18 << getBCHDigit(d) - getBCHDigit(G18);
					return data << 12 | d;
				};
				_this.getPatternPosition = function(typeNumber) {
					return PATTERN_POSITION_TABLE[typeNumber - 1];
				};
				_this.getMaskFunction = function(maskPattern) {
					switch (maskPattern) {
						case QRMaskPattern.PATTERN000: return function(i, j) {
							return (i + j) % 2 == 0;
						};
						case QRMaskPattern.PATTERN001: return function(i, j) {
							return i % 2 == 0;
						};
						case QRMaskPattern.PATTERN010: return function(i, j) {
							return j % 3 == 0;
						};
						case QRMaskPattern.PATTERN011: return function(i, j) {
							return (i + j) % 3 == 0;
						};
						case QRMaskPattern.PATTERN100: return function(i, j) {
							return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 == 0;
						};
						case QRMaskPattern.PATTERN101: return function(i, j) {
							return i * j % 2 + i * j % 3 == 0;
						};
						case QRMaskPattern.PATTERN110: return function(i, j) {
							return (i * j % 2 + i * j % 3) % 2 == 0;
						};
						case QRMaskPattern.PATTERN111: return function(i, j) {
							return (i * j % 3 + (i + j) % 2) % 2 == 0;
						};
						default: throw "bad maskPattern:" + maskPattern;
					}
				};
				_this.getErrorCorrectPolynomial = function(errorCorrectLength) {
					var a = qrPolynomial([1], 0);
					for (var i = 0; i < errorCorrectLength; i += 1) a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0));
					return a;
				};
				_this.getLengthInBits = function(mode, type) {
					if (1 <= type && type < 10) switch (mode) {
						case QRMode.MODE_NUMBER: return 10;
						case QRMode.MODE_ALPHA_NUM: return 9;
						case QRMode.MODE_8BIT_BYTE: return 8;
						case QRMode.MODE_KANJI: return 8;
						default: throw "mode:" + mode;
					}
					else if (type < 27) switch (mode) {
						case QRMode.MODE_NUMBER: return 12;
						case QRMode.MODE_ALPHA_NUM: return 11;
						case QRMode.MODE_8BIT_BYTE: return 16;
						case QRMode.MODE_KANJI: return 10;
						default: throw "mode:" + mode;
					}
					else if (type < 41) switch (mode) {
						case QRMode.MODE_NUMBER: return 14;
						case QRMode.MODE_ALPHA_NUM: return 13;
						case QRMode.MODE_8BIT_BYTE: return 16;
						case QRMode.MODE_KANJI: return 12;
						default: throw "mode:" + mode;
					}
					else throw "type:" + type;
				};
				_this.getLostPoint = function(qrcode) {
					var moduleCount = qrcode.getModuleCount();
					var lostPoint = 0;
					for (var row = 0; row < moduleCount; row += 1) for (var col = 0; col < moduleCount; col += 1) {
						var sameCount = 0;
						var dark = qrcode.isDark(row, col);
						for (var r = -1; r <= 1; r += 1) {
							if (row + r < 0 || moduleCount <= row + r) continue;
							for (var c = -1; c <= 1; c += 1) {
								if (col + c < 0 || moduleCount <= col + c) continue;
								if (r == 0 && c == 0) continue;
								if (dark == qrcode.isDark(row + r, col + c)) sameCount += 1;
							}
						}
						if (sameCount > 5) lostPoint += 3 + sameCount - 5;
					}
					for (var row = 0; row < moduleCount - 1; row += 1) for (var col = 0; col < moduleCount - 1; col += 1) {
						var count = 0;
						if (qrcode.isDark(row, col)) count += 1;
						if (qrcode.isDark(row + 1, col)) count += 1;
						if (qrcode.isDark(row, col + 1)) count += 1;
						if (qrcode.isDark(row + 1, col + 1)) count += 1;
						if (count == 0 || count == 4) lostPoint += 3;
					}
					for (var row = 0; row < moduleCount; row += 1) for (var col = 0; col < moduleCount - 6; col += 1) if (qrcode.isDark(row, col) && !qrcode.isDark(row, col + 1) && qrcode.isDark(row, col + 2) && qrcode.isDark(row, col + 3) && qrcode.isDark(row, col + 4) && !qrcode.isDark(row, col + 5) && qrcode.isDark(row, col + 6)) lostPoint += 40;
					for (var col = 0; col < moduleCount; col += 1) for (var row = 0; row < moduleCount - 6; row += 1) if (qrcode.isDark(row, col) && !qrcode.isDark(row + 1, col) && qrcode.isDark(row + 2, col) && qrcode.isDark(row + 3, col) && qrcode.isDark(row + 4, col) && !qrcode.isDark(row + 5, col) && qrcode.isDark(row + 6, col)) lostPoint += 40;
					var darkCount = 0;
					for (var col = 0; col < moduleCount; col += 1) for (var row = 0; row < moduleCount; row += 1) if (qrcode.isDark(row, col)) darkCount += 1;
					var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
					lostPoint += ratio * 10;
					return lostPoint;
				};
				return _this;
			}();
			var QRMath = function() {
				var EXP_TABLE = new Array(256);
				var LOG_TABLE = new Array(256);
				for (var i = 0; i < 8; i += 1) EXP_TABLE[i] = 1 << i;
				for (var i = 8; i < 256; i += 1) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
				for (var i = 0; i < 255; i += 1) LOG_TABLE[EXP_TABLE[i]] = i;
				var _this = {};
				_this.glog = function(n) {
					if (n < 1) throw "glog(" + n + ")";
					return LOG_TABLE[n];
				};
				_this.gexp = function(n) {
					while (n < 0) n += 255;
					while (n >= 256) n -= 255;
					return EXP_TABLE[n];
				};
				return _this;
			}();
			function qrPolynomial(num, shift) {
				if (typeof num.length == "undefined") throw num.length + "/" + shift;
				var _num = function() {
					var offset = 0;
					while (offset < num.length && num[offset] == 0) offset += 1;
					var _num = new Array(num.length - offset + shift);
					for (var i = 0; i < num.length - offset; i += 1) _num[i] = num[i + offset];
					return _num;
				}();
				var _this = {};
				_this.getAt = function(index) {
					return _num[index];
				};
				_this.getLength = function() {
					return _num.length;
				};
				_this.multiply = function(e) {
					var num = new Array(_this.getLength() + e.getLength() - 1);
					for (var i = 0; i < _this.getLength(); i += 1) for (var j = 0; j < e.getLength(); j += 1) num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i)) + QRMath.glog(e.getAt(j)));
					return qrPolynomial(num, 0);
				};
				_this.mod = function(e) {
					if (_this.getLength() - e.getLength() < 0) return _this;
					var ratio = QRMath.glog(_this.getAt(0)) - QRMath.glog(e.getAt(0));
					var num = new Array(_this.getLength());
					for (var i = 0; i < _this.getLength(); i += 1) num[i] = _this.getAt(i);
					for (var i = 0; i < e.getLength(); i += 1) num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i)) + ratio);
					return qrPolynomial(num, 0).mod(e);
				};
				return _this;
			}
			var QRRSBlock = function() {
				var RS_BLOCK_TABLE = [
					[
						1,
						26,
						19
					],
					[
						1,
						26,
						16
					],
					[
						1,
						26,
						13
					],
					[
						1,
						26,
						9
					],
					[
						1,
						44,
						34
					],
					[
						1,
						44,
						28
					],
					[
						1,
						44,
						22
					],
					[
						1,
						44,
						16
					],
					[
						1,
						70,
						55
					],
					[
						1,
						70,
						44
					],
					[
						2,
						35,
						17
					],
					[
						2,
						35,
						13
					],
					[
						1,
						100,
						80
					],
					[
						2,
						50,
						32
					],
					[
						2,
						50,
						24
					],
					[
						4,
						25,
						9
					],
					[
						1,
						134,
						108
					],
					[
						2,
						67,
						43
					],
					[
						2,
						33,
						15,
						2,
						34,
						16
					],
					[
						2,
						33,
						11,
						2,
						34,
						12
					],
					[
						2,
						86,
						68
					],
					[
						4,
						43,
						27
					],
					[
						4,
						43,
						19
					],
					[
						4,
						43,
						15
					],
					[
						2,
						98,
						78
					],
					[
						4,
						49,
						31
					],
					[
						2,
						32,
						14,
						4,
						33,
						15
					],
					[
						4,
						39,
						13,
						1,
						40,
						14
					],
					[
						2,
						121,
						97
					],
					[
						2,
						60,
						38,
						2,
						61,
						39
					],
					[
						4,
						40,
						18,
						2,
						41,
						19
					],
					[
						4,
						40,
						14,
						2,
						41,
						15
					],
					[
						2,
						146,
						116
					],
					[
						3,
						58,
						36,
						2,
						59,
						37
					],
					[
						4,
						36,
						16,
						4,
						37,
						17
					],
					[
						4,
						36,
						12,
						4,
						37,
						13
					],
					[
						2,
						86,
						68,
						2,
						87,
						69
					],
					[
						4,
						69,
						43,
						1,
						70,
						44
					],
					[
						6,
						43,
						19,
						2,
						44,
						20
					],
					[
						6,
						43,
						15,
						2,
						44,
						16
					],
					[
						4,
						101,
						81
					],
					[
						1,
						80,
						50,
						4,
						81,
						51
					],
					[
						4,
						50,
						22,
						4,
						51,
						23
					],
					[
						3,
						36,
						12,
						8,
						37,
						13
					],
					[
						2,
						116,
						92,
						2,
						117,
						93
					],
					[
						6,
						58,
						36,
						2,
						59,
						37
					],
					[
						4,
						46,
						20,
						6,
						47,
						21
					],
					[
						7,
						42,
						14,
						4,
						43,
						15
					],
					[
						4,
						133,
						107
					],
					[
						8,
						59,
						37,
						1,
						60,
						38
					],
					[
						8,
						44,
						20,
						4,
						45,
						21
					],
					[
						12,
						33,
						11,
						4,
						34,
						12
					],
					[
						3,
						145,
						115,
						1,
						146,
						116
					],
					[
						4,
						64,
						40,
						5,
						65,
						41
					],
					[
						11,
						36,
						16,
						5,
						37,
						17
					],
					[
						11,
						36,
						12,
						5,
						37,
						13
					],
					[
						5,
						109,
						87,
						1,
						110,
						88
					],
					[
						5,
						65,
						41,
						5,
						66,
						42
					],
					[
						5,
						54,
						24,
						7,
						55,
						25
					],
					[
						11,
						36,
						12,
						7,
						37,
						13
					],
					[
						5,
						122,
						98,
						1,
						123,
						99
					],
					[
						7,
						73,
						45,
						3,
						74,
						46
					],
					[
						15,
						43,
						19,
						2,
						44,
						20
					],
					[
						3,
						45,
						15,
						13,
						46,
						16
					],
					[
						1,
						135,
						107,
						5,
						136,
						108
					],
					[
						10,
						74,
						46,
						1,
						75,
						47
					],
					[
						1,
						50,
						22,
						15,
						51,
						23
					],
					[
						2,
						42,
						14,
						17,
						43,
						15
					],
					[
						5,
						150,
						120,
						1,
						151,
						121
					],
					[
						9,
						69,
						43,
						4,
						70,
						44
					],
					[
						17,
						50,
						22,
						1,
						51,
						23
					],
					[
						2,
						42,
						14,
						19,
						43,
						15
					],
					[
						3,
						141,
						113,
						4,
						142,
						114
					],
					[
						3,
						70,
						44,
						11,
						71,
						45
					],
					[
						17,
						47,
						21,
						4,
						48,
						22
					],
					[
						9,
						39,
						13,
						16,
						40,
						14
					],
					[
						3,
						135,
						107,
						5,
						136,
						108
					],
					[
						3,
						67,
						41,
						13,
						68,
						42
					],
					[
						15,
						54,
						24,
						5,
						55,
						25
					],
					[
						15,
						43,
						15,
						10,
						44,
						16
					],
					[
						4,
						144,
						116,
						4,
						145,
						117
					],
					[
						17,
						68,
						42
					],
					[
						17,
						50,
						22,
						6,
						51,
						23
					],
					[
						19,
						46,
						16,
						6,
						47,
						17
					],
					[
						2,
						139,
						111,
						7,
						140,
						112
					],
					[
						17,
						74,
						46
					],
					[
						7,
						54,
						24,
						16,
						55,
						25
					],
					[
						34,
						37,
						13
					],
					[
						4,
						151,
						121,
						5,
						152,
						122
					],
					[
						4,
						75,
						47,
						14,
						76,
						48
					],
					[
						11,
						54,
						24,
						14,
						55,
						25
					],
					[
						16,
						45,
						15,
						14,
						46,
						16
					],
					[
						6,
						147,
						117,
						4,
						148,
						118
					],
					[
						6,
						73,
						45,
						14,
						74,
						46
					],
					[
						11,
						54,
						24,
						16,
						55,
						25
					],
					[
						30,
						46,
						16,
						2,
						47,
						17
					],
					[
						8,
						132,
						106,
						4,
						133,
						107
					],
					[
						8,
						75,
						47,
						13,
						76,
						48
					],
					[
						7,
						54,
						24,
						22,
						55,
						25
					],
					[
						22,
						45,
						15,
						13,
						46,
						16
					],
					[
						10,
						142,
						114,
						2,
						143,
						115
					],
					[
						19,
						74,
						46,
						4,
						75,
						47
					],
					[
						28,
						50,
						22,
						6,
						51,
						23
					],
					[
						33,
						46,
						16,
						4,
						47,
						17
					],
					[
						8,
						152,
						122,
						4,
						153,
						123
					],
					[
						22,
						73,
						45,
						3,
						74,
						46
					],
					[
						8,
						53,
						23,
						26,
						54,
						24
					],
					[
						12,
						45,
						15,
						28,
						46,
						16
					],
					[
						3,
						147,
						117,
						10,
						148,
						118
					],
					[
						3,
						73,
						45,
						23,
						74,
						46
					],
					[
						4,
						54,
						24,
						31,
						55,
						25
					],
					[
						11,
						45,
						15,
						31,
						46,
						16
					],
					[
						7,
						146,
						116,
						7,
						147,
						117
					],
					[
						21,
						73,
						45,
						7,
						74,
						46
					],
					[
						1,
						53,
						23,
						37,
						54,
						24
					],
					[
						19,
						45,
						15,
						26,
						46,
						16
					],
					[
						5,
						145,
						115,
						10,
						146,
						116
					],
					[
						19,
						75,
						47,
						10,
						76,
						48
					],
					[
						15,
						54,
						24,
						25,
						55,
						25
					],
					[
						23,
						45,
						15,
						25,
						46,
						16
					],
					[
						13,
						145,
						115,
						3,
						146,
						116
					],
					[
						2,
						74,
						46,
						29,
						75,
						47
					],
					[
						42,
						54,
						24,
						1,
						55,
						25
					],
					[
						23,
						45,
						15,
						28,
						46,
						16
					],
					[
						17,
						145,
						115
					],
					[
						10,
						74,
						46,
						23,
						75,
						47
					],
					[
						10,
						54,
						24,
						35,
						55,
						25
					],
					[
						19,
						45,
						15,
						35,
						46,
						16
					],
					[
						17,
						145,
						115,
						1,
						146,
						116
					],
					[
						14,
						74,
						46,
						21,
						75,
						47
					],
					[
						29,
						54,
						24,
						19,
						55,
						25
					],
					[
						11,
						45,
						15,
						46,
						46,
						16
					],
					[
						13,
						145,
						115,
						6,
						146,
						116
					],
					[
						14,
						74,
						46,
						23,
						75,
						47
					],
					[
						44,
						54,
						24,
						7,
						55,
						25
					],
					[
						59,
						46,
						16,
						1,
						47,
						17
					],
					[
						12,
						151,
						121,
						7,
						152,
						122
					],
					[
						12,
						75,
						47,
						26,
						76,
						48
					],
					[
						39,
						54,
						24,
						14,
						55,
						25
					],
					[
						22,
						45,
						15,
						41,
						46,
						16
					],
					[
						6,
						151,
						121,
						14,
						152,
						122
					],
					[
						6,
						75,
						47,
						34,
						76,
						48
					],
					[
						46,
						54,
						24,
						10,
						55,
						25
					],
					[
						2,
						45,
						15,
						64,
						46,
						16
					],
					[
						17,
						152,
						122,
						4,
						153,
						123
					],
					[
						29,
						74,
						46,
						14,
						75,
						47
					],
					[
						49,
						54,
						24,
						10,
						55,
						25
					],
					[
						24,
						45,
						15,
						46,
						46,
						16
					],
					[
						4,
						152,
						122,
						18,
						153,
						123
					],
					[
						13,
						74,
						46,
						32,
						75,
						47
					],
					[
						48,
						54,
						24,
						14,
						55,
						25
					],
					[
						42,
						45,
						15,
						32,
						46,
						16
					],
					[
						20,
						147,
						117,
						4,
						148,
						118
					],
					[
						40,
						75,
						47,
						7,
						76,
						48
					],
					[
						43,
						54,
						24,
						22,
						55,
						25
					],
					[
						10,
						45,
						15,
						67,
						46,
						16
					],
					[
						19,
						148,
						118,
						6,
						149,
						119
					],
					[
						18,
						75,
						47,
						31,
						76,
						48
					],
					[
						34,
						54,
						24,
						34,
						55,
						25
					],
					[
						20,
						45,
						15,
						61,
						46,
						16
					]
				];
				var qrRSBlock = function(totalCount, dataCount) {
					var _this = {};
					_this.totalCount = totalCount;
					_this.dataCount = dataCount;
					return _this;
				};
				var _this = {};
				var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {
					switch (errorCorrectionLevel) {
						case QRErrorCorrectionLevel.L: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
						case QRErrorCorrectionLevel.M: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
						case QRErrorCorrectionLevel.Q: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
						case QRErrorCorrectionLevel.H: return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
						default: return;
					}
				};
				_this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {
					var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);
					if (typeof rsBlock == "undefined") throw "bad rs block @ typeNumber:" + typeNumber + "/errorCorrectionLevel:" + errorCorrectionLevel;
					var length = rsBlock.length / 3;
					var list = [];
					for (var i = 0; i < length; i += 1) {
						var count = rsBlock[i * 3 + 0];
						var totalCount = rsBlock[i * 3 + 1];
						var dataCount = rsBlock[i * 3 + 2];
						for (var j = 0; j < count; j += 1) list.push(qrRSBlock(totalCount, dataCount));
					}
					return list;
				};
				return _this;
			}();
			var qrBitBuffer = function() {
				var _buffer = [];
				var _length = 0;
				var _this = {};
				_this.getBuffer = function() {
					return _buffer;
				};
				_this.getAt = function(index) {
					return (_buffer[Math.floor(index / 8)] >>> 7 - index % 8 & 1) == 1;
				};
				_this.put = function(num, length) {
					for (var i = 0; i < length; i += 1) _this.putBit((num >>> length - i - 1 & 1) == 1);
				};
				_this.getLengthInBits = function() {
					return _length;
				};
				_this.putBit = function(bit) {
					var bufIndex = Math.floor(_length / 8);
					if (_buffer.length <= bufIndex) _buffer.push(0);
					if (bit) _buffer[bufIndex] |= 128 >>> _length % 8;
					_length += 1;
				};
				return _this;
			};
			var qrNumber = function(data) {
				var _mode = QRMode.MODE_NUMBER;
				var _data = data;
				var _this = {};
				_this.getMode = function() {
					return _mode;
				};
				_this.getLength = function(buffer) {
					return _data.length;
				};
				_this.write = function(buffer) {
					var data = _data;
					var i = 0;
					while (i + 2 < data.length) {
						buffer.put(strToNum(data.substring(i, i + 3)), 10);
						i += 3;
					}
					if (i < data.length) {
						if (data.length - i == 1) buffer.put(strToNum(data.substring(i, i + 1)), 4);
						else if (data.length - i == 2) buffer.put(strToNum(data.substring(i, i + 2)), 7);
					}
				};
				var strToNum = function(s) {
					var num = 0;
					for (var i = 0; i < s.length; i += 1) num = num * 10 + chatToNum(s.charAt(i));
					return num;
				};
				var chatToNum = function(c) {
					if ("0" <= c && c <= "9") return c.charCodeAt(0) - "0".charCodeAt(0);
					throw "illegal char :" + c;
				};
				return _this;
			};
			var qrAlphaNum = function(data) {
				var _mode = QRMode.MODE_ALPHA_NUM;
				var _data = data;
				var _this = {};
				_this.getMode = function() {
					return _mode;
				};
				_this.getLength = function(buffer) {
					return _data.length;
				};
				_this.write = function(buffer) {
					var s = _data;
					var i = 0;
					while (i + 1 < s.length) {
						buffer.put(getCode(s.charAt(i)) * 45 + getCode(s.charAt(i + 1)), 11);
						i += 2;
					}
					if (i < s.length) buffer.put(getCode(s.charAt(i)), 6);
				};
				var getCode = function(c) {
					if ("0" <= c && c <= "9") return c.charCodeAt(0) - "0".charCodeAt(0);
					else if ("A" <= c && c <= "Z") return c.charCodeAt(0) - "A".charCodeAt(0) + 10;
					else switch (c) {
						case " ": return 36;
						case "$": return 37;
						case "%": return 38;
						case "*": return 39;
						case "+": return 40;
						case "-": return 41;
						case ".": return 42;
						case "/": return 43;
						case ":": return 44;
						default: throw "illegal char :" + c;
					}
				};
				return _this;
			};
			var qr8BitByte = function(data) {
				var _mode = QRMode.MODE_8BIT_BYTE;
				var _bytes = qrcode.stringToBytes(data);
				var _this = {};
				_this.getMode = function() {
					return _mode;
				};
				_this.getLength = function(buffer) {
					return _bytes.length;
				};
				_this.write = function(buffer) {
					for (var i = 0; i < _bytes.length; i += 1) buffer.put(_bytes[i], 8);
				};
				return _this;
			};
			var qrKanji = function(data) {
				var _mode = QRMode.MODE_KANJI;
				var stringToBytes = qrcode.stringToBytesFuncs["SJIS"];
				if (!stringToBytes) throw "sjis not supported.";
				(function(c, code) {
					var test = stringToBytes(c);
					if (test.length != 2 || (test[0] << 8 | test[1]) != code) throw "sjis not supported.";
				})("友", 38726);
				var _bytes = stringToBytes(data);
				var _this = {};
				_this.getMode = function() {
					return _mode;
				};
				_this.getLength = function(buffer) {
					return ~~(_bytes.length / 2);
				};
				_this.write = function(buffer) {
					var data = _bytes;
					var i = 0;
					while (i + 1 < data.length) {
						var c = (255 & data[i]) << 8 | 255 & data[i + 1];
						if (33088 <= c && c <= 40956) c -= 33088;
						else if (57408 <= c && c <= 60351) c -= 49472;
						else throw "illegal char at " + (i + 1) + "/" + c;
						c = (c >>> 8 & 255) * 192 + (c & 255);
						buffer.put(c, 13);
						i += 2;
					}
					if (i < data.length) throw "illegal char at " + (i + 1);
				};
				return _this;
			};
			var byteArrayOutputStream = function() {
				var _bytes = [];
				var _this = {};
				_this.writeByte = function(b) {
					_bytes.push(b & 255);
				};
				_this.writeShort = function(i) {
					_this.writeByte(i);
					_this.writeByte(i >>> 8);
				};
				_this.writeBytes = function(b, off, len) {
					off = off || 0;
					len = len || b.length;
					for (var i = 0; i < len; i += 1) _this.writeByte(b[i + off]);
				};
				_this.writeString = function(s) {
					for (var i = 0; i < s.length; i += 1) _this.writeByte(s.charCodeAt(i));
				};
				_this.toByteArray = function() {
					return _bytes;
				};
				_this.toString = function() {
					var s = "";
					s += "[";
					for (var i = 0; i < _bytes.length; i += 1) {
						if (i > 0) s += ",";
						s += _bytes[i];
					}
					s += "]";
					return s;
				};
				return _this;
			};
			var base64EncodeOutputStream = function() {
				var _buffer = 0;
				var _buflen = 0;
				var _length = 0;
				var _base64 = "";
				var _this = {};
				var writeEncoded = function(b) {
					_base64 += String.fromCharCode(encode(b & 63));
				};
				var encode = function(n) {
					if (n < 0) {} else if (n < 26) return 65 + n;
					else if (n < 52) return 97 + (n - 26);
					else if (n < 62) return 48 + (n - 52);
					else if (n == 62) return 43;
					else if (n == 63) return 47;
					throw "n:" + n;
				};
				_this.writeByte = function(n) {
					_buffer = _buffer << 8 | n & 255;
					_buflen += 8;
					_length += 1;
					while (_buflen >= 6) {
						writeEncoded(_buffer >>> _buflen - 6);
						_buflen -= 6;
					}
				};
				_this.flush = function() {
					if (_buflen > 0) {
						writeEncoded(_buffer << 6 - _buflen);
						_buffer = 0;
						_buflen = 0;
					}
					if (_length % 3 != 0) {
						var padlen = 3 - _length % 3;
						for (var i = 0; i < padlen; i += 1) _base64 += "=";
					}
				};
				_this.toString = function() {
					return _base64;
				};
				return _this;
			};
			var base64DecodeInputStream = function(str) {
				var _str = str;
				var _pos = 0;
				var _buffer = 0;
				var _buflen = 0;
				var _this = {};
				_this.read = function() {
					while (_buflen < 8) {
						if (_pos >= _str.length) {
							if (_buflen == 0) return -1;
							throw "unexpected end of file./" + _buflen;
						}
						var c = _str.charAt(_pos);
						_pos += 1;
						if (c == "=") {
							_buflen = 0;
							return -1;
						} else if (c.match(/^\s$/)) continue;
						_buffer = _buffer << 6 | decode(c.charCodeAt(0));
						_buflen += 6;
					}
					var n = _buffer >>> _buflen - 8 & 255;
					_buflen -= 8;
					return n;
				};
				var decode = function(c) {
					if (65 <= c && c <= 90) return c - 65;
					else if (97 <= c && c <= 122) return c - 97 + 26;
					else if (48 <= c && c <= 57) return c - 48 + 52;
					else if (c == 43) return 62;
					else if (c == 47) return 63;
					else throw "c:" + c;
				};
				return _this;
			};
			var gifImage = function(width, height) {
				var _width = width;
				var _height = height;
				var _data = new Array(width * height);
				var _this = {};
				_this.setPixel = function(x, y, pixel) {
					_data[y * _width + x] = pixel;
				};
				_this.write = function(out) {
					out.writeString("GIF87a");
					out.writeShort(_width);
					out.writeShort(_height);
					out.writeByte(128);
					out.writeByte(0);
					out.writeByte(0);
					out.writeByte(0);
					out.writeByte(0);
					out.writeByte(0);
					out.writeByte(255);
					out.writeByte(255);
					out.writeByte(255);
					out.writeString(",");
					out.writeShort(0);
					out.writeShort(0);
					out.writeShort(_width);
					out.writeShort(_height);
					out.writeByte(0);
					var lzwMinCodeSize = 2;
					var raster = getLZWRaster(lzwMinCodeSize);
					out.writeByte(lzwMinCodeSize);
					var offset = 0;
					while (raster.length - offset > 255) {
						out.writeByte(255);
						out.writeBytes(raster, offset, 255);
						offset += 255;
					}
					out.writeByte(raster.length - offset);
					out.writeBytes(raster, offset, raster.length - offset);
					out.writeByte(0);
					out.writeString(";");
				};
				var bitOutputStream = function(out) {
					var _out = out;
					var _bitLength = 0;
					var _bitBuffer = 0;
					var _this = {};
					_this.write = function(data, length) {
						if (data >>> length != 0) throw "length over";
						while (_bitLength + length >= 8) {
							_out.writeByte(255 & (data << _bitLength | _bitBuffer));
							length -= 8 - _bitLength;
							data >>>= 8 - _bitLength;
							_bitBuffer = 0;
							_bitLength = 0;
						}
						_bitBuffer = data << _bitLength | _bitBuffer;
						_bitLength = _bitLength + length;
					};
					_this.flush = function() {
						if (_bitLength > 0) _out.writeByte(_bitBuffer);
					};
					return _this;
				};
				var getLZWRaster = function(lzwMinCodeSize) {
					var clearCode = 1 << lzwMinCodeSize;
					var endCode = (1 << lzwMinCodeSize) + 1;
					var bitLength = lzwMinCodeSize + 1;
					var table = lzwTable();
					for (var i = 0; i < clearCode; i += 1) table.add(String.fromCharCode(i));
					table.add(String.fromCharCode(clearCode));
					table.add(String.fromCharCode(endCode));
					var byteOut = byteArrayOutputStream();
					var bitOut = bitOutputStream(byteOut);
					bitOut.write(clearCode, bitLength);
					var dataIndex = 0;
					var s = String.fromCharCode(_data[dataIndex]);
					dataIndex += 1;
					while (dataIndex < _data.length) {
						var c = String.fromCharCode(_data[dataIndex]);
						dataIndex += 1;
						if (table.contains(s + c)) s = s + c;
						else {
							bitOut.write(table.indexOf(s), bitLength);
							if (table.size() < 4095) {
								if (table.size() == 1 << bitLength) bitLength += 1;
								table.add(s + c);
							}
							s = c;
						}
					}
					bitOut.write(table.indexOf(s), bitLength);
					bitOut.write(endCode, bitLength);
					bitOut.flush();
					return byteOut.toByteArray();
				};
				var lzwTable = function() {
					var _map = {};
					var _size = 0;
					var _this = {};
					_this.add = function(key) {
						if (_this.contains(key)) throw "dup key:" + key;
						_map[key] = _size;
						_size += 1;
					};
					_this.size = function() {
						return _size;
					};
					_this.indexOf = function(key) {
						return _map[key];
					};
					_this.contains = function(key) {
						return typeof _map[key] != "undefined";
					};
					return _this;
				};
				return _this;
			};
			var createDataURL = function(width, height, getPixel) {
				var gif = gifImage(width, height);
				for (var y = 0; y < height; y += 1) for (var x = 0; x < width; x += 1) gif.setPixel(x, y, getPixel(x, y));
				var b = byteArrayOutputStream();
				gif.write(b);
				var base64 = base64EncodeOutputStream();
				var bytes = b.toByteArray();
				for (var i = 0; i < bytes.length; i += 1) base64.writeByte(bytes[i]);
				base64.flush();
				return "data:image/gif;base64," + base64;
			};
			return qrcode;
		}();
		(function() {
			qrcode.stringToBytesFuncs["UTF-8"] = function(s) {
				function toUTF8Array(str) {
					var utf8 = [];
					for (var i = 0; i < str.length; i++) {
						var charcode = str.charCodeAt(i);
						if (charcode < 128) utf8.push(charcode);
						else if (charcode < 2048) utf8.push(192 | charcode >> 6, 128 | charcode & 63);
						else if (charcode < 55296 || charcode >= 57344) utf8.push(224 | charcode >> 12, 128 | charcode >> 6 & 63, 128 | charcode & 63);
						else {
							i++;
							charcode = 65536 + ((charcode & 1023) << 10 | str.charCodeAt(i) & 1023);
							utf8.push(240 | charcode >> 18, 128 | charcode >> 12 & 63, 128 | charcode >> 6 & 63, 128 | charcode & 63);
						}
					}
					return utf8;
				}
				return toUTF8Array(s);
			};
		})();
		// \0dsh-css:E:\workspace\dsh-plugins\packages\dsh-remote-ctrl\src\client\panel.module.css.mjs
		const css = ".n-Kf7q_layer{flex:none;align-items:center;height:42px;margin:8px 0 0;padding:0 0 0 2px;display:flex;position:relative}.n-Kf7q_rail{justify-content:center;width:36px;height:36px;margin:4px 0;padding:0}.n-Kf7q_trigger{border-radius:var(--dsw-radius-md);width:32px;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex;position:relative}.n-Kf7q_rail .n-Kf7q_trigger{width:36px;height:36px}@media (hover:hover){.n-Kf7q_trigger:hover{color:var(--dsw-alias-label-primary)}}.n-Kf7q_trigger[data-active=true]{color:var(--dsw-alias-state-warn-primary)}@media (hover:hover){.n-Kf7q_trigger[data-active=true]:hover{color:var(--dsw-alias-state-warn-label)}}.n-Kf7q_trigger:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.n-Kf7q_overlay{z-index:1000;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.n-Kf7q_mask{inset:var(--dsh-frame-chrome-top,0px) 0 0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);position:absolute}.n-Kf7q_dialog{z-index:1;width:900px;height:min(720px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top,24px))));border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);max-width:calc(100vw - 48px);box-shadow:var(--dsw-elevation-prominent);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);flex-direction:column;display:flex;position:relative;overflow:hidden}.n-Kf7q_dialog:focus{outline:none}.n-Kf7q_dialogHeader{box-sizing:border-box;flex:none;align-items:center;gap:10px;padding:20px 56px 12px 20px;display:flex}.n-Kf7q_dialogIcon{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);width:40px;height:40px;color:var(--dsw-alias-label-primary);flex:none;justify-content:center;align-items:center;display:inline-flex}.n-Kf7q_dialogHeading{flex-direction:column;gap:2px;min-width:0;display:flex}.n-Kf7q_dialogTitle{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}.n-Kf7q_dialogSubtitle{color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:18px}.n-Kf7q_closeButton{border-radius:var(--dsw-radius-sm);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:12px;right:12px}@media (hover:hover){.n-Kf7q_closeButton:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}.n-Kf7q_closeButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.n-Kf7q_dialogBody{flex:1;min-height:0;padding:0 20px 16px;overflow:hidden}.n-Kf7q_page{height:100%;min-height:0;color:var(--dsw-alias-label-primary);overflow-wrap:break-word;flex-direction:column;gap:16px;font-size:13px;line-height:1.5;display:flex}.n-Kf7q_page *{box-sizing:border-box}.n-Kf7q_grid{flex:1;grid-template-columns:minmax(0,1.45fr) minmax(300px,1fr);align-items:stretch;gap:16px;min-height:0;display:grid}@media (width<=860px){.n-Kf7q_dialog{height:auto;max-height:min(760px, calc(100vh - 2 * max(24px, var(--dsh-frame-overlay-top,24px))))}.n-Kf7q_dialogBody{overflow-y:auto}.n-Kf7q_page{height:auto}.n-Kf7q_grid{grid-template-columns:minmax(0,1fr)}.n-Kf7q_qrArea{min-height:200px}.n-Kf7q_addressList{max-height:260px}}.n-Kf7q_card{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);flex-direction:column;gap:10px;min-height:0;padding:14px;display:flex;overflow-y:auto}.n-Kf7q_cardHead{align-items:flex-start;gap:8px;display:flex}.n-Kf7q_cardIcon{color:var(--dsw-alias-label-tertiary);flex:none;margin-top:2px;display:inline-flex}.n-Kf7q_cardTitles{flex-direction:column;gap:2px;min-width:0;display:flex}.n-Kf7q_cardTitle{color:var(--dsw-alias-label-primary);margin:0;font-size:13.5px;font-weight:600;line-height:20px}.n-Kf7q_hint{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;margin:0;font-size:12.5px;line-height:18px}.n-Kf7q_detail{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin:0;font-size:12.5px;line-height:18px}.n-Kf7q_errorText{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;margin:0;font-size:12.5px;line-height:18px}.n-Kf7q_connectionCard{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);flex-direction:column;gap:10px;padding:10px;display:flex}.n-Kf7q_connectionRow{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.n-Kf7q_connectionText{flex-direction:column;flex:1;gap:3px;min-width:0;display:flex}.n-Kf7q_statusRow{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.n-Kf7q_statusRunning,.n-Kf7q_statusStopped{font-size:13px;font-weight:600;line-height:20px}.n-Kf7q_statusRunning{color:var(--dsw-alias-label-primary)}.n-Kf7q_statusStopped{color:var(--dsw-alias-label-tertiary)}.n-Kf7q_statusTag{corner-shape:round;background:var(--dsw-alias-bg-layer-1);height:20px;color:var(--dsw-alias-label-secondary);border-radius:999px;align-items:center;gap:5px;padding:0 8px;font-size:11px;font-weight:500;display:inline-flex}.n-Kf7q_statusDot{corner-shape:round;background:var(--dsw-alias-state-idle-primary);border-radius:50%;width:6px;height:6px}.n-Kf7q_statusTag[data-on=true] .n-Kf7q_statusDot{background:var(--dsw-alias-state-success-primary)}.n-Kf7q_copyRow{border-top:.5px solid var(--dsw-alias-border-l1);flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding-top:10px;display:flex}.n-Kf7q_outlineButton,.n-Kf7q_actionButton{border-radius:var(--dsw-radius-sm);height:30px;color:var(--dsw-alias-label-primary);cursor:pointer;flex:none;justify-content:center;align-items:center;gap:6px;padding:0 12px;font-family:inherit;font-size:12.5px;line-height:18px;display:inline-flex}.n-Kf7q_outlineButton{border:.5px solid var(--dsw-alias-border-l2);background:0 0}.n-Kf7q_actionButton{background:var(--dsw-alias-interactive-bg-hover);border:0}@media (hover:hover){.n-Kf7q_outlineButton:hover:not(:disabled),.n-Kf7q_actionButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-pressed,var(--dsw-alias-border-l1))}}.n-Kf7q_outlineButton:disabled,.n-Kf7q_actionButton:disabled{opacity:.5;cursor:default}.n-Kf7q_outlineButton:focus-visible,.n-Kf7q_actionButton:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.n-Kf7q_qrArea{border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);flex:1;justify-content:center;align-items:center;min-height:190px;padding:10px;display:flex}.n-Kf7q_qrImage{border-radius:var(--dsw-radius-md);background:#fff;flex:none;width:176px;height:176px;padding:8px}.n-Kf7q_qrImage svg{width:100%;height:100%;display:block}.n-Kf7q_addressList{flex-direction:column;flex:auto;gap:6px;min-height:0;padding-right:2px;display:flex;overflow-y:auto}.n-Kf7q_addressOption{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);width:100%;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;background:0 0;flex-direction:column;gap:2px;padding:8px 10px;display:flex}@media (hover:hover){.n-Kf7q_addressOption:hover{background:var(--dsw-alias-interactive-bg-hover)}}.n-Kf7q_addressOption[data-checked=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}.n-Kf7q_addressOption:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.n-Kf7q_addressHead{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.n-Kf7q_addressIp{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;line-height:18px}.n-Kf7q_scopeTag,.n-Kf7q_recommendTag{corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);height:18px;color:var(--dsw-alias-label-secondary);border-radius:999px;align-items:center;padding:0 6px;font-size:11px;line-height:16px;display:inline-flex}.n-Kf7q_recommendTag{border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-brand-primary);background:0 0}.n-Kf7q_addressUrl{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;font-family:ui-monospace,Consolas,monospace;font-size:11px;line-height:16px}.n-Kf7q_tokenSection{border-top:.5px solid var(--dsw-alias-border-l1);flex-direction:column;gap:8px;padding-top:12px;display:flex}.n-Kf7q_tokenRow{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.n-Kf7q_tokenValue{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);overflow-wrap:anywhere;flex:1;min-width:0;padding:6px 8px;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:18px}.n-Kf7q_stateBlock{flex-direction:column;align-items:flex-start;gap:10px;padding:4px;display:flex}";
		const tagId = "dsh-remote-ctrl/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-remote-ctrl";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"actionButton": "n-Kf7q_actionButton",
			"addressHead": "n-Kf7q_addressHead",
			"addressIp": "n-Kf7q_addressIp",
			"addressList": "n-Kf7q_addressList",
			"addressOption": "n-Kf7q_addressOption",
			"addressUrl": "n-Kf7q_addressUrl",
			"card": "n-Kf7q_card",
			"cardHead": "n-Kf7q_cardHead",
			"cardIcon": "n-Kf7q_cardIcon",
			"cardTitle": "n-Kf7q_cardTitle",
			"cardTitles": "n-Kf7q_cardTitles",
			"closeButton": "n-Kf7q_closeButton",
			"connectionCard": "n-Kf7q_connectionCard",
			"connectionRow": "n-Kf7q_connectionRow",
			"connectionText": "n-Kf7q_connectionText",
			"copyRow": "n-Kf7q_copyRow",
			"detail": "n-Kf7q_detail",
			"dialog": "n-Kf7q_dialog",
			"dialogBody": "n-Kf7q_dialogBody",
			"dialogHeader": "n-Kf7q_dialogHeader",
			"dialogHeading": "n-Kf7q_dialogHeading",
			"dialogIcon": "n-Kf7q_dialogIcon",
			"dialogSubtitle": "n-Kf7q_dialogSubtitle",
			"dialogTitle": "n-Kf7q_dialogTitle",
			"errorText": "n-Kf7q_errorText",
			"grid": "n-Kf7q_grid",
			"hint": "n-Kf7q_hint",
			"layer": "n-Kf7q_layer",
			"mask": "n-Kf7q_mask",
			"outlineButton": "n-Kf7q_outlineButton",
			"overlay": "n-Kf7q_overlay",
			"page": "n-Kf7q_page",
			"qrArea": "n-Kf7q_qrArea",
			"qrImage": "n-Kf7q_qrImage",
			"rail": "n-Kf7q_rail",
			"recommendTag": "n-Kf7q_recommendTag",
			"scopeTag": "n-Kf7q_scopeTag",
			"stateBlock": "n-Kf7q_stateBlock",
			"statusDot": "n-Kf7q_statusDot",
			"statusRow": "n-Kf7q_statusRow",
			"statusRunning": "n-Kf7q_statusRunning",
			"statusStopped": "n-Kf7q_statusStopped",
			"statusTag": "n-Kf7q_statusTag",
			"tokenRow": "n-Kf7q_tokenRow",
			"tokenSection": "n-Kf7q_tokenSection",
			"tokenValue": "n-Kf7q_tokenValue",
			"trigger": "n-Kf7q_trigger"
		};
		// src/client/Panel.tsx
		/**
		* Remote Control dialog body (ZCode's remote-control layout): the left card
		* carries the status strip, the copy-link row, the pairing token and the QR
		* code; the right card carries the LAN-address switcher. Picking an address
		* re-points both the QR code and the copied link; the token only rotates
		* through the explicit confirm step.
		*
		* @module dsh-remote-ctrl/client/Panel
		*/
		/** QR payload → SVG markup ('' when the payload cannot be encoded). */
		function qrSvg(payload) {
			if (payload === "") return "";
			try {
				const qr = qrcode(0, "M");
				qr.addData(payload);
				qr.make();
				return String(qr.createSvgTag({
					cellSize: 4,
					margin: 2,
					scalable: true
				}));
			} catch {
				return "";
			}
		}
		function scopeLabel(scope, t) {
			if (scope === "private") return t("scopePrivate");
			if (scope === "public") return t("scopePublic");
			if (scope === "link-local") return t("scopeLinkLocal");
			return scope;
		}
		/** Render the dialog body. */
		function Panel({ useRemote, actions, t }) {
			const state = useRemote(identity);
			const [selectedUrl, setSelectedUrl] = (0, react.useState)();
			const [confirmRefresh, setConfirmRefresh] = (0, react.useState)(false);
			const data = state.data;
			if (state.status === "loading" && data === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.stateBlock,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.hint,
					children: t("subtitle")
				})
			});
			if (data === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.stateBlock,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.errorText,
						children: `${t("apiUnavailable")}：${state.error || t("unknownError")}`
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hint,
						children: t("apiHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.actionButton,
						onClick: () => {
							actions.load();
						},
						children: t("retry")
					})
				]
			});
			const addresses = Array.isArray(data.addresses) ? data.addresses : [];
			const selected = addresses.find((entry) => entry.url === selectedUrl) ?? addresses.find((entry) => entry.url === data.recommendedUrl) ?? addresses[0];
			const link = selected === void 0 ? "" : `${selected.url}?token=${encodeURIComponent(data.token)}`;
			const qr = link === "" ? "" : qrSvg(link);
			const copiedLink = state.copied === "link";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.page,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.grid,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.card,
						"data-remote-ctrl-scan-card": true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.cardHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.cardIcon,
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelGlyph, {})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.cardTitles,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: panel_module_css_default.cardTitle,
										children: t("qrTitle")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default.hint,
										children: t("qrHint")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.connectionCard,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.connectionRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.connectionText,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.statusRow,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: data.listening ? panel_module_css_default.statusRunning : panel_module_css_default.statusStopped,
														children: data.listening ? t("running") : t("stopped")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.statusTag,
														"data-on": data.listening,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: panel_module_css_default.statusDot,
															"aria-hidden": "true"
														}), data.listening ? t("enabledTag") : t("disabledTag")]
													})]
												}),
												data.listening && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: panel_module_css_default.detail,
													children: t("clients", { count: data.clientCount })
												}),
												data.error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: panel_module_css_default.errorText,
													role: "alert",
													children: `${t("serverError")}：${data.error}`
												}),
												!data.upstream.ready && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													className: panel_module_css_default.detail,
													children: t("upstreamMissing")
												})
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: data.listening ? panel_module_css_default.outlineButton : panel_module_css_default.actionButton,
											disabled: state.pending,
											"data-remote-ctrl-toggle": data.listening ? "stop" : "start",
											onClick: () => {
												data.listening ? actions.stop() : actions.start();
											},
											children: data.listening ? t("stop") : t("start")
										})]
									}),
									state.error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default.errorText,
										role: "alert",
										children: state.error
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.copyRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.detail,
											children: t("copyLinkDesc")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.outlineButton,
											disabled: link === "" || !data.listening || state.pending,
											"data-remote-ctrl-copy-link": true,
											onClick: () => {
												actions.copy(link, "link");
											},
											children: copiedLink ? t("copied") : t("copyLink")
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.tokenSection,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.cardTitles,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: panel_module_css_default.cardTitle,
										children: t("tokenTitle")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default.hint,
										children: data.tokenPinned ? t("tokenPinned") : t("tokenPermanent")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.tokenRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
										className: panel_module_css_default.tokenValue,
										children: data.token
									}), confirmRefresh ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.actionButton,
										disabled: state.pending,
										"data-remote-ctrl-refresh-confirm": true,
										onClick: () => {
											setConfirmRefresh(false);
											actions.refreshToken();
										},
										children: t("refreshConfirm")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.outlineButton,
										onClick: () => {
											setConfirmRefresh(false);
										},
										children: t("cancel")
									})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.outlineButton,
										disabled: state.pending || data.tokenPinned,
										"data-remote-ctrl-refresh-token": true,
										onClick: () => {
											setConfirmRefresh(true);
										},
										children: t("refreshToken")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.qrArea,
								children: data.listening && qr !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.qrImage,
									"data-testid": "qr",
									dangerouslySetInnerHTML: { __html: qr }
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: panel_module_css_default.hint,
									children: data.listening ? link || t("noAddress") : t("stoppedHint")
								})
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.card,
						"data-remote-ctrl-address-card": true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.cardHead,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.cardIcon,
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NetworkGlyph, {})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.cardTitles,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										className: panel_module_css_default.cardTitle,
										children: t("addresses")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: panel_module_css_default.hint,
										children: t("addressesDesc")
									})]
								})]
							}),
							addresses.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.hint,
								children: t("noAddress")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.addressList,
								role: "radiogroup",
								"aria-label": t("addresses"),
								"data-remote-ctrl-address-list": true,
								children: addresses.map((entry) => {
									const checked = entry.url === selected?.url;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "radio",
										"aria-checked": checked,
										className: panel_module_css_default.addressOption,
										"data-address": entry.address,
										"data-checked": checked,
										onClick: () => {
											setSelectedUrl(entry.url);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.addressHead,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
													className: panel_module_css_default.addressIp,
													children: entry.address
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.scopeTag,
													children: scopeLabel(String(entry.scope), t)
												}),
												entry.url === data.recommendedUrl && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.recommendTag,
													children: t("recommended")
												})
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.addressUrl,
											children: entry.url
										})]
									}, entry.url);
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: panel_module_css_default.hint,
								children: t("securityHint")
							})
						]
					})]
				})
			});
		}
		/** Small phone glyph for the scan card head. */
		function PanelGlyph() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.7",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "5",
					y: "2",
					width: "14",
					height: "20",
					rx: "2",
					ry: "2"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 18h.01" })]
			});
		}
		/** Small network glyph for the address card head. */
		function NetworkGlyph() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.7",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "3",
						y: "3",
						width: "7",
						height: "7",
						rx: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "14",
						y: "14",
						width: "7",
						height: "7",
						rx: "1.5"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 6.5h4a3 3 0 0 1 3 3v4" })
				]
			});
		}
		// src/client/Launcher.tsx
		/**
		* Sidebar-foot launcher and the frame-wide Remote Control dialog it opens.
		*
		* The dialog is a real modal: it portals beside `#root`, paints the shared
		* mask token over every column, keeps its own focus (`Tab` cycles inside,
		* `Escape` and a mask click close it), and returns focus to the trigger.
		* Polling runs only while the dialog is open; the trigger keeps the amber
		* enabled highlight (ZCode's remote-control entry) while the gateway listens.
		*
		* @module dsh-remote-ctrl/client/Launcher
		*/
		/** Elements that take focus inside the modal. */
		const FOCUSABLE = [
			"button:not([disabled])",
			"[href]",
			"input:not([disabled])",
			"select:not([disabled])",
			"textarea:not([disabled])",
			"[tabindex]:not([tabindex=\"-1\"])"
		].join(", ");
		/** Render the sidebar-foot launcher and its dialog. */
		function Launcher({ wide, useRemote, actions, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const listening = useRemote((state) => state.data?.listening === true);
			const pending = useRemote((state) => state.pending);
			const trigger = (0, react.useRef)(null);
			const dialog = (0, react.useRef)(null);
			const wasOpen = (0, react.useRef)(false);
			const titleId = (0, react.useId)();
			(0, react.useEffect)(() => {
				if (wasOpen.current && !open) trigger.current?.focus();
				wasOpen.current = open;
			}, [open]);
			(0, react.useEffect)(() => {
				actions.load();
			}, [actions]);
			(0, react.useEffect)(() => {
				if (!open) return;
				actions.init();
				return () => {
					actions.destroy();
				};
			}, [actions, open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const panel = dialog.current;
				panel?.focus();
				const onKeyDown = (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						setOpen(false);
						return;
					}
					if (event.key !== "Tab" || panel === null) return;
					const nodes = Array.from(panel.querySelectorAll(FOCUSABLE));
					const first = nodes[0];
					const last = nodes[nodes.length - 1];
					if (first === void 0 || last === void 0) return;
					if (event.shiftKey) {
						if (document.activeElement === first || document.activeElement === panel) {
							event.preventDefault();
							last.focus();
						}
						return;
					}
					if (document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				};
				document.addEventListener("keydown", onKeyDown, true);
				return () => {
					document.removeEventListener("keydown", onKeyDown, true);
				};
			}, [open]);
			const close = () => {
				setOpen(false);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: wide ? panel_module_css_default.layer : `${panel_module_css_default.layer} ${panel_module_css_default.rail}`,
				children: [open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.overlay,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.mask,
						"aria-hidden": "true",
						"data-remote-ctrl-mask": true,
						onClick: close
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: dialog,
						className: panel_module_css_default.dialog,
						role: "dialog",
						"aria-modal": "true",
						"aria-labelledby": titleId,
						tabIndex: -1,
						"data-remote-ctrl-dialog": true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: panel_module_css_default.dialogHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.dialogIcon,
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelIcon, { size: 20 })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.dialogHeading,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.dialogTitle,
										id: titleId,
										children: t("title")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.dialogSubtitle,
										children: t("subtitle")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.closeButton,
								"aria-label": t("close"),
								"data-remote-ctrl-close": true,
								onClick: close,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
									width: "16",
									height: "16",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "1.8",
									strokeLinecap: "round",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M18 6 6 18M6 6l12 12" })
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.dialogBody,
								"data-remote-ctrl-dialog-body": true,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Panel, {
									useRemote,
									actions,
									t
								})
							})
						]
					})]
				}), document.body), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					ref: trigger,
					type: "button",
					className: panel_module_css_default.trigger,
					"aria-label": t("title"),
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					title: listening ? `${t("title")} · ${t("running")}` : t("title"),
					"data-remote-ctrl-trigger": true,
					"data-active": listening,
					onClick: () => {
						if (open) {
							setOpen(false);
							return;
						}
						setOpen(true);
						if (!listening && !pending) actions.start();
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelIcon, {
						active: listening,
						size: wide ? 16 : 18
					})
				})]
			});
		}
		// src/client/index.ts
		/** Required browser services for slots and localized copy. */
		const inject = ["slots", "locale"];
		/**
		* Contribute the Remote Control launcher to the sidebar foot.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				ctx.locale.register(NS, dictionaries);
			}, "dsh-remote-ctrl: dictionaries");
			const controller = createRemoteController();
			ctx.effect(() => () => controller.actions.destroy(), "dsh-remote-ctrl: controller");
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "remote-ctrl",
				order: 0,
				locale: NS,
				inject: () => ({
					hooks: { remote: controller.store },
					actions: controller.actions
				})
			}, Launcher));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map