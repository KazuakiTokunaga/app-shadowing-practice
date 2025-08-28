class ShadowingApp {
    constructor() {
        this.currentExercise = null;
        this.currentTurn = 0;
        this.totalTurns = 0;
        this.turns = [];
        this.recordings = [];
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.listeningAudio = null;  // リスニング用音声
        this.shadowingAudio = null;  // シャドーイング用音声
        this.isRecording = false;
        this.isEditing = false;
        this.recordingTimeoutId = null;
        this.recordingStarted = false;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupKeyboardListeners();
        this.loadExercises();
        this.loadSettings();
    }

    // 日時フォーマッタ（サーバーはUTC想定。タイムゾーン未指定はUTCとして扱う）
    formatDateTime(isoString) {
        if (!isoString) return '';
        const normalized = this.normalizeToUtcIsoString(isoString);
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return '';
        // 長いタイムゾーン名だと崩れることがあるので省略名にする
        return date.toLocaleString('ja-JP', {
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    }

    // 日付のみ表示用（サーバーUTC→ローカル）
    formatDate(isoString) {
        if (!isoString) return '';
        const normalized = this.normalizeToUtcIsoString(isoString);
        const date = new Date(normalized);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString('ja-JP');
    }

    // 受け取った日時文字列がタイムゾーン未指定の場合はUTCとして解釈できるよう加工
    normalizeToUtcIsoString(value) {
        if (typeof value !== 'string') return value;
        // すでにタイムゾーン情報がある（Z or +09:00 等）場合はそのまま
        if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return value;
        // 空白区切りをTに置換してISOっぽくし、UTCを明示
        const withT = value.replace(' ', 'T');
        return withT.endsWith('Z') ? withT : `${withT}Z`;
    }

    setupEventListeners() {
        // ナビゲーション
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchPage(e.target.dataset.page);
            });
        });

        // 課題作成
        document.getElementById('create-exercise-btn').addEventListener('click', () => {
            this.showCreateExerciseModal();
        });

        // 課題作成モーダル
        document.getElementById('submit-create-btn').addEventListener('click', () => {
            this.createExercise();
        });

        document.getElementById('cancel-create-btn').addEventListener('click', () => {
            this.hideModal('create-exercise-modal');
        });

        // 単語数カウント
        document.getElementById('exercise-content').addEventListener('input', (e) => {
            this.updateWordCount(e.target.value);
        });

        // タイトル入力時のバリデーション
        document.getElementById('exercise-title').addEventListener('input', () => {
            const content = document.getElementById('exercise-content').value;
            this.updateWordCount(content);
        });

        // ソート
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.loadExercises(e.target.value);
        });

        // 設定
        document.getElementById('save-settings-btn').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('reset-settings-btn').addEventListener('click', () => {
            this.resetSettings();
        });

        // 読み上げ速度の変更イベント
        document.getElementById('speech-rate').addEventListener('change', (e) => {
            console.log('Speech rate changed to:', e.target.value);
        });



        // モーダル閉じる
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.hideModal(modal.id);
            });
        });

        // モーダル外クリックで閉じる
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // 課題詳細モーダルのタブ
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 課題詳細モーダルのボタン
        this.setupDetailModalButtons();
    }

    setupDetailModalButtons() {
        // タイトル編集ボタン
        document.getElementById('edit-title-btn').addEventListener('click', () => {
            this.toggleTitleEditMode();
        });

        // タイトル保存・キャンセルボタン
        document.getElementById('save-title-btn').addEventListener('click', () => {
            this.saveTitleChanges();
        });

        document.getElementById('cancel-title-btn').addEventListener('click', () => {
            this.cancelTitleChanges();
        });

        // 削除ボタン
        document.getElementById('delete-exercise-btn').addEventListener('click', () => {
            this.deleteExercise();
        });

        // リスニング
        document.getElementById('play-full-audio-btn').addEventListener('click', () => {
            this.playFullAudio();
        });

        document.getElementById('pause-full-audio-btn').addEventListener('click', () => {
            this.pauseFullAudio();
        });

        // シャドーイング
        document.getElementById('start-turn-btn').addEventListener('click', () => {
            this.startTurn();
        });

        document.getElementById('next-turn-btn').addEventListener('click', () => {
            this.nextTurn();
        });

        document.getElementById('retry-turn-btn').addEventListener('click', () => {
            this.retryTurn();
        });

        document.getElementById('finish-shadowing-btn').addEventListener('click', () => {
            this.finishShadowing();
        });
    }

    // ページ切り替え
    switchPage(pageName) {
        // ページ切り替え時に音声を停止
        // リスニング音声を停止
        if (this.listeningAudio) {
            this.listeningAudio.pause();
            this.listeningAudio = null;
            this.resetAudioPlayer();
        }
        
        // シャドーイング音声を停止
        if (this.shadowingAudio) {
            this.shadowingAudio.pause();
            this.shadowingAudio = null;
        }
        
        // 録音中の場合は停止
        if (this.isRecording) {
            this.stopRecording();
        }

        // ナビゲーションボタンの状態更新
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === pageName);
        });

        // ページの表示切り替え
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === `${pageName}-page`);
        });

        // ページ固有の処理
        if (pageName === 'exercises') {
            this.loadExercises();
        } else if (pageName === 'settings') {
            this.loadSettings();
        }
    }

    // モーダル表示
    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // モーダル非表示
    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        document.body.style.overflow = 'auto';
        
        // exercise-detail-modalの場合のみ音声を停止
        if (modalId === 'exercise-detail-modal') {
            // リスニング音声停止
            if (this.listeningAudio) {
                this.listeningAudio.pause();
                this.listeningAudio = null;
                this.resetAudioPlayer();
            }
            
            // シャドーイング音声停止
            if (this.shadowingAudio) {
                this.shadowingAudio.pause();
                this.shadowingAudio = null;
            }
            
            // 録音停止
            if (this.isRecording) {
                this.stopRecording();
            }
        }
        
        // 録音タイムアウトをクリア
        if (this.recordingTimeoutId) {
            clearTimeout(this.recordingTimeoutId);
            this.recordingTimeoutId = null;
        }
        
        // 編集モードをリセット
        this.isEditing = false;

        
        // result-modalを閉じる際は、結果一覧（exercise-detail-modalのresultsタブ）へ戻す
        if (modalId === 'result-modal') {
            const detailModal = document.getElementById('exercise-detail-modal');
            if (detailModal) {
                // 結果詳細モーダルを閉じ、詳細モーダルを再度表示
                detailModal.classList.add('active');
                // 依然としてモーダルが開いているためスクロールを無効化
                document.body.style.overflow = 'hidden';
                // 結果タブを表示
                this.switchTab('results');
            }
            return;
        }
    }

    // ローディング表示
    showLoading(text = '処理中...') {
        const loading = document.getElementById('loading');
        loading.querySelector('.loading-text').textContent = text;
        loading.style.display = 'flex';
    }

    // ローディング非表示
    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    // エラー表示
    showError(message) {
        alert('エラー: ' + message);
        this.hideLoading();
    }

    // 成功メッセージ表示
    showSuccess(message) {
        // 簡易的な成功メッセージ（本格的にはtoastなどを実装）
        console.log('成功: ' + message);
    }

    // API呼び出し
    async apiCall(url, options = {}) {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // 課題一覧読み込み
    async loadExercises(sortBy = 'created_at:desc') {
        try {
            this.showLoading('課題一覧を読み込み中...');
            const [sortField, sortOrder] = sortBy.split(':');
            
            const response = await this.apiCall(`/api/exercises/?sort_by=${sortField}&order=${sortOrder}`);
            
            if (response.success) {
                this.renderExercises(response.data);
            } else {
                this.showError(response.message);
            }
        } catch (error) {
            this.showError('課題一覧の読み込みに失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 課題一覧レンダリング
    renderExercises(exercises) {
        const container = document.getElementById('exercises-container');
        
        if (exercises.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #7f8c8d; font-size: 1.1rem; padding: 2rem;">まだ課題がありません。新しい課題を作成してください。</div>';
            return;
        }

        container.innerHTML = exercises.map(exercise => `
            <div class="exercise-card" data-exercise-id="${exercise.id}">
                <h3>${this.escapeHtml(exercise.title)}</h3>
                <div class="meta">
                    作成日: ${this.formatDate(exercise.created_at)}
                    ${exercise.last_practiced_at ? 
                        `<br>最終実施: ${this.formatDate(exercise.last_practiced_at)}` : 
                        ''
                    }
                </div>
                <div class="stats">
                    <span class="score">
                        最高スコア: ${exercise.max_score ? exercise.max_score.toFixed(1) + '%' : '未実施'}
                    </span>
                    <span class="attempts">
                        実施回数: ${exercise.attempt_count}回
                    </span>
                </div>
            </div>
        `).join('');

        // 課題カードのクリックイベント
        container.querySelectorAll('.exercise-card').forEach(card => {
            card.addEventListener('click', () => {
                const exerciseId = parseInt(card.dataset.exerciseId);
                this.showExerciseDetail(exerciseId);
            });
        });
    }

    // 課題作成モーダル表示
    showCreateExerciseModal() {
        document.getElementById('exercise-title').value = '';
        document.getElementById('exercise-content').value = '';
        this.updateWordCount('');
        this.showModal('create-exercise-modal');
    }

    // 単語数更新
    updateWordCount(text) {
        const words = text.trim().split(/\s+/).filter(word => word.length > 0);
        const count = text.trim() === '' ? 0 : words.length;
        document.getElementById('word-count').textContent = count;
        
        // 単語数チェック
        const submitBtn = document.getElementById('submit-create-btn');
        const title = document.getElementById('exercise-title').value.trim();
        
        // タイトルと単語数の両方をチェック
        if (count < 50 || count > 300 || !title) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';
        } else {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
        }
    }

    // 課題作成
    async createExercise() {
        const title = document.getElementById('exercise-title').value.trim();
        const content = document.getElementById('exercise-content').value.trim();

        if (!title) {
            this.showError('タイトルを入力してください');
            return;
        }

        if (!content) {
            this.showError('英文を入力してください');
            return;
        }

        const words = content.split(/\s+/).filter(word => word.length > 0);
        if (words.length < 50 || words.length > 300) {
            this.showError('英文は50単語から300単語の間で入力してください');
            return;
        }

        try {
            this.showLoading('課題を作成中...');
            
            const response = await this.apiCall('/api/exercises/', {
                method: 'POST',
                body: JSON.stringify({
                    title: title,
                    content: content
                })
            });

            if (response.success) {
                this.showSuccess('課題を作成しました');
                this.hideModal('create-exercise-modal');
                this.loadExercises();
            } else {
                this.showError(response.message);
            }
        } catch (error) {
            this.showError('課題の作成に失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 課題詳細表示
    async showExerciseDetail(exerciseId) {
        try {
            this.showLoading('課題詳細を読み込み中...');
            
            const response = await this.apiCall(`/api/exercises/${exerciseId}`);
            
            if (response.success) {
                this.currentExercise = response.data;
                this.renderExerciseDetail();
                this.showModal('exercise-detail-modal');
            } else {
                this.showError(response.message);
            }
        } catch (error) {
            this.showError('課題詳細の読み込みに失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 課題詳細レンダリング
    renderExerciseDetail() {
        const exercise = this.currentExercise;
        
        // タイトル設定
        document.getElementById('exercise-detail-title').textContent = exercise.title;
        
        // 詳細タブ
        document.getElementById('detail-title').value = exercise.title;
        document.getElementById('detail-content').value = exercise.content;
        
        // 単語数を表示
        document.getElementById('detail-word-count').textContent = exercise.word_count || 0;
        
        // 音声再生速度を表示
        const speechRate = exercise.speech_rate || 1.0;
        document.getElementById('detail-speech-rate').textContent = speechRate.toFixed(1);
        
        // 音声の種類を表示（頭文字を大文字に）
        const speechVoice = exercise.speech_voice || 'alloy';
        document.getElementById('detail-speech-voice').textContent = speechVoice.charAt(0).toUpperCase() + speechVoice.slice(1);
        
        // 編集ボタンの表示をリセット
        document.getElementById('edit-title-btn').style.display = 'inline-block';
        document.getElementById('save-title-btn').style.display = 'none';
        document.getElementById('cancel-title-btn').style.display = 'none';
        document.getElementById('detail-title').readOnly = true;
        
        // 詳細タブのターン分割は表示しない（UIから削除済み）
        
        // リスニングタブ
        this.renderListeningTurns(exercise.turns);
        
        // シャドーイングタブ初期化
        this.initShadowing(exercise.turns);
        
        // 結果タブ
        this.loadExerciseResults(exercise.id);
        
        // デフォルトで詳細タブを表示
        this.switchTab('detail');
    }

    // 以前は詳細タブにターン分割を表示していたがUIから削除

    // リスニングタブのターン表示
    renderListeningTurns(turns) {
        const container = document.getElementById('listen-turns-container');
        container.innerHTML = turns.map(turn => `
            <div class="listen-turn-item">
                <div class="listen-turn-number">${turn.id}</div>
                <div class="listen-turn-text">${this.escapeHtml(turn.text)}</div>
            </div>
        `).join('');
    }

    // タブ切り替え
    switchTab(tabName) {
        // タブボタンの状態更新
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // タブコンテンツの表示切り替え
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // リスニングタブから他のタブに切り替えた場合、音声を停止
        if (tabName !== 'listen' && this.listeningAudio) {
            this.listeningAudio.pause();
            this.resetAudioPlayer();
        }

        // タブ固有の初期化処理
        if (tabName === 'shadowing') {
            if (this.currentExercise && this.currentExercise.turns) {
                this.initShadowing(this.currentExercise.turns);
            } else {
                console.error('課題情報が見つかりません');
            }
        }
    }

    // シャドーイング初期化
    async initShadowing(turns) {
        console.log('initShadowing called with turns:', turns);
        this.turns = turns;
        this.totalTurns = turns.length;
        this.currentTurn = 0;
        this.recordings = [];
        
        // オーディオシステムを事前に準備
        await this.prepareAudioSystem();
        
        document.getElementById('total-turns').textContent = this.totalTurns;
        this.updateShadowingDisplay();
    }

    // オーディオシステムの事前準備
    async prepareAudioSystem() {
        try {
            console.log('オーディオシステムを初期化中...');
            
            // マイクの権限を取得
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // テストレコーダーを作成して少し録音
            const testRecorder = new MediaRecorder(stream);
            const testChunks = [];
            
            testRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    testChunks.push(event.data);
                }
            };
            
            // 短時間録音を開始
            testRecorder.start();
            
            // 300ms後に停止
            await new Promise(resolve => setTimeout(resolve, 300));
            
            testRecorder.stop();
            
            // ストリームを停止
            await new Promise(resolve => setTimeout(resolve, 100));
            stream.getTracks().forEach(track => track.stop());
            
            console.log('オーディオシステムの初期化完了');
        } catch (error) {
            console.error('オーディオシステムの初期化に失敗:', error);
        }
    }

    // シャドーイング表示更新
    updateShadowingDisplay() {
        const currentTurnDisplay = document.getElementById('current-turn');
        const turnTextContent = document.getElementById('turn-text-content');
        const startBtn = document.getElementById('start-turn-btn');
        const nextBtn = document.getElementById('next-turn-btn');
        const retryBtn = document.getElementById('retry-turn-btn');
        const finishBtn = document.getElementById('finish-shadowing-btn');

        if (this.currentTurn < this.totalTurns) {
            currentTurnDisplay.textContent = this.currentTurn + 1;
            // シャドーイング画面では英語テキストを表示しない
            turnTextContent.textContent = '音声を聞いてシャドーイングしてください';
            
            startBtn.style.display = 'inline-block';
            nextBtn.style.display = 'none';
            retryBtn.style.display = 'none';
            finishBtn.style.display = 'none';
        } else {
            turnTextContent.textContent = 'すべてのターンが完了しました';
            startBtn.style.display = 'none';
            nextBtn.style.display = 'none';
            retryBtn.style.display = 'none';
            finishBtn.style.display = 'inline-block';
        }
    }

    // ターン開始
    async startTurn() {
        if (this.currentTurn >= this.totalTurns) return;

        // currentExerciseが存在するかチェック
        if (!this.currentExercise || !this.currentExercise.id) {
            this.showError('課題情報が見つかりません');
            return;
        }

        const turn = this.turns[this.currentTurn];
        
        try {
            // 録音を先に開始
            await this.startRecording();
            
            // MediaRecorderが実際に録音を開始するまで待機
            await this.waitForRecordingReady();
            
            // 1秒待機してから音声を再生
            console.log('録音開始から音声再生まで1秒待機中...');
            setTimeout(async () => {
                try {
                    console.log('音声再生開始');
                    await this.playTurnAudio(this.currentExercise.id, turn.id);
                } catch (error) {
                    this.showError('音声の再生に失敗しました: ' + error.message);
                }
            }, 1000);
            
        } catch (error) {
            this.showError('録音の開始に失敗しました: ' + error.message);
        }
    }



    // MediaRecorderが準備完了するまで待機
    async waitForRecordingReady() {
        return new Promise((resolve) => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                // 録音が開始されていることを確認
                // 最初のデータチャンクが受信されるまで待機
                let checkInterval = setInterval(() => {
                    if (this.recordingStarted) {
                        clearInterval(checkInterval);
                        // データ受信確認後、さらに200ms待機
                        setTimeout(resolve, 200);
                    }
                }, 50);
                
                // タイムアウト設定（最大1秒待機）
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 1000);
            } else {
                resolve();
            }
        });
    }

    // ターン音声再生
    async playTurnAudio(exerciseId, turnId) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(`/api/audio/${exerciseId}/turn/${turnId}`);
            
            audio.onended = () => {
                // 音声再生完了後、「次へ」ボタンを表示
                this.onAudioPlaybackComplete();
                resolve();
            };
            
            audio.onerror = () => {
                reject(new Error('音声の読み込みに失敗しました'));
            };
            
            this.shadowingAudio = audio;
            audio.play().catch(reject);
        });
    }

    // 音声再生完了時の処理
    onAudioPlaybackComplete() {
        // UI更新：「次へ」ボタンとやり直しボタンを表示
        document.getElementById('start-turn-btn').style.display = 'none';  
        document.getElementById('next-turn-btn').style.display = 'inline-block';
        document.getElementById('retry-turn-btn').style.display = 'inline-block';
        
        // キーボードヒントを再表示
        const keyboardHint = document.getElementById('keyboard-hint');
        if (keyboardHint) {
            keyboardHint.style.display = 'block';
        }
    }

    // 録音開始
    async startRecording() {
        try {
            const constraints = {
                audio: {
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Web Audio APIを使用してマイクの準備を確実に行う
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(1024, 1, 1);
            
            // プロセッサーを接続（実際の処理は行わない）
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            // 少し待機してオーディオシステムを安定させる
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // プロセッサーを切断
            processor.disconnect();
            source.disconnect();
            
            // MediaRecorderのオプションを指定
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            };
            
            // MediaRecorderがサポートしているかチェック
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
            }
            
            this.mediaRecorder = new MediaRecorder(stream, options);
            this.audioChunks = [];
            
            // データ収集開始を確認するためのフラグ
            this.recordingStarted = false;
            this.firstChunkTime = null;
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    // 最初のデータチャンクを受信したことを記録
                    if (!this.recordingStarted) {
                        this.recordingStarted = true;
                        this.firstChunkTime = Date.now();
                        console.log('録音データの受信開始');
                    }
                }
            };
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: options.mimeType });
                this.recordings[this.currentTurn] = audioBlob;
                console.log(`録音完了: ターン ${this.currentTurn + 1}, 録音数: ${this.recordings.length}`);
                this.onRecordingComplete();
            };
            
            // より短いタイムスライスで録音開始（50msごと）
            this.mediaRecorder.start(50);
            this.isRecording = true;
            
            // UI更新
            document.getElementById('recording-status').style.display = 'flex';
            document.getElementById('start-turn-btn').style.display = 'none';
            
            // 録音中はキーボードヒントを非表示
            const keyboardHint = document.getElementById('keyboard-hint');
            if (keyboardHint) {
                keyboardHint.style.display = 'none';
            }
            
            // 20秒後に自動停止
            this.recordingTimeoutId = setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, 20000);
            
        } catch (error) {
            this.showError('マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。');
        }
    }

    // 録音停止
    stopRecording() {
        return new Promise((resolve) => {
            if (this.mediaRecorder && this.isRecording) {
                // 録音停止完了を待つ
                const originalOnStop = this.mediaRecorder.onstop;
                this.mediaRecorder.onstop = () => {
                    // 元のonstopハンドラを実行
                    if (originalOnStop) {
                        originalOnStop();
                    }
                    resolve();
                };
                
                this.mediaRecorder.stop();
                this.isRecording = false;
                
                // マイクアクセスを停止
                this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
                
                // タイムアウトをクリア
                if (this.recordingTimeoutId) {
                    clearTimeout(this.recordingTimeoutId);
                    this.recordingTimeoutId = null;
                }
            } else {
                resolve();
            }
        });
    }

    // 録音完了時の処理
    onRecordingComplete() {
        // UI更新：録音状態のみ非表示
        document.getElementById('recording-status').style.display = 'none';
        // 「次へ」ボタンの表示は音声再生完了時に行う
    }



    // 次のターンへ
    async nextTurn() {
        // 録音中の場合は停止を待つ
        if (this.isRecording) {
            await this.stopRecording();
        }
        
        this.currentTurn++;
        this.updateShadowingDisplay();
        
        // 最後のターンでない場合は、次のターンを自動開始
        if (this.currentTurn < this.totalTurns) {
            await this.startTurn();
        }
    }

    // やり直し
    async retryTurn() {
        // 録音中の場合は停止を待つ
        if (this.isRecording) {
            await this.stopRecording();
        }
        
        this.updateShadowingDisplay();
        // 現在のターンを再実行
        await this.startTurn();
    }

    // シャドーイング完了
    async finishShadowing() {
        // 録音中の場合は停止を待つ
        if (this.isRecording) {
            await this.stopRecording();
        }
        
        console.log(`シャドーイング完了時の録音データ: ${this.recordings.length}個, ターン数: ${this.totalTurns}`);
        
        if (this.recordings.length === 0) {
            this.showError('録音データがありません');
            return;
        }

        // currentExerciseが存在するかチェック
        if (!this.currentExercise || !this.currentExercise.id) {
            this.showError('課題情報が見つかりません');
            return;
        }

        // turnsが存在するかチェック
        if (!this.turns || this.turns.length === 0) {
            this.showError('ターン情報が見つかりません');
            return;
        }

        try {
            this.showLoading('音声を解析中...');
            
            // 音声を一括でサーバーに送信して書き起こし
            const transcriptions = await this.transcribeRecordings();
            
            // 結果を保存
            const response = await this.apiCall(`/api/shadowing/${this.currentExercise.id}/result`, {
                method: 'POST',
                body: JSON.stringify(transcriptions)
            });

            if (response.success) {
                this.showResult(response.data);
            } else {
                this.showError(response.message);
            }
            
        } catch (error) {
            this.showError('結果の処理に失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 録音データの書き起こし
    async transcribeRecordings() {
        // currentExerciseが存在するかチェック
        if (!this.currentExercise || !this.currentExercise.id) {
            throw new Error('課題情報が見つかりません');
        }

        // turnsが存在するかチェック
        if (!this.turns || this.turns.length === 0) {
            throw new Error('ターン情報が見つかりません');
        }

        const formData = new FormData();
        const turnIds = [];
        
        this.recordings.forEach((recording, index) => {
            if (recording) {
                if (this.turns[index] && this.turns[index].id) {
                    // webm形式として正しくファイル名を設定
                    const webmBlob = new Blob([recording], { type: 'audio/webm' });
                    formData.append('audio_files', webmBlob, `turn_${index}.webm`);
                    turnIds.push(this.turns[index].id);
                } else {
                    console.error(`ターン情報が見つかりません: index=${index}, turns.length=${this.turns.length}, turn=`, this.turns[index]);
                }
            }
        });
        
        formData.append('turn_ids', JSON.stringify(turnIds));
        
        const response = await fetch(`/api/shadowing/${this.currentExercise.id}/transcribe-batch`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('音声の書き起こしに失敗しました');
        }

        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message);
        }

        return result.data.map(item => item.transcription);
    }

    // テキストを比較して差分をハイライト表示
    compareTexts(original, recognized) {
        // 英語テキストを単語に分割（単語、数字、句読点を個別に扱う）
        const originalWords = original.match(/\b[\w']+\b|[^\w\s]/g) || [];
        const recognizedWords = recognized.match(/\b[\w']+\b|[^\w\s]/g) || [];
        
        console.log('Original words:', originalWords);
        console.log('Recognized words:', recognizedWords);
        
        // 最長共通部分列（LCS）アルゴリズムで差分を検出
        const dp = Array(originalWords.length + 1).fill(null).map(() => 
            Array(recognizedWords.length + 1).fill(0)
        );
        
        // DPテーブルを構築
        for (let i = 1; i <= originalWords.length; i++) {
            for (let j = 1; j <= recognizedWords.length; j++) {
                if (originalWords[i - 1].toLowerCase() === recognizedWords[j - 1].toLowerCase()) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        // バックトラックして一致/不一致を判定
        const highlightedOriginal = [];
        let i = originalWords.length;
        let j = recognizedWords.length;
        const matchedIndices = new Set();
        
        while (i > 0 && j > 0) {
            if (originalWords[i - 1].toLowerCase() === recognizedWords[j - 1].toLowerCase()) {
                matchedIndices.add(i - 1);
                i--;
                j--;
            } else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        
        // 元の文章をハイライト付きでレンダリング
        return originalWords.map((word, index) => {
            const isMatched = matchedIndices.has(index);
            const escapedWord = this.escapeHtml(word);
            
            // 次の単語が句読点かどうかをチェック
            const nextWord = originalWords[index + 1];
            const isPunctuation = /^[^\w\s]$/.test(word);
            const nextIsPunctuation = nextWord && /^[^\w\s]$/.test(nextWord);
            const isAlphabeticWord = /^[a-zA-Z']+$/.test(word);  // アルファベットの単語かチェック
            
            // 単語をハイライト（アルファベットの単語で不一致の場合のみ）
            let highlightedWord;
            if (isMatched || !isAlphabeticWord) {
                // 一致している、または句読点/記号の場合はハイライトしない
                highlightedWord = escapedWord;
            } else {
                // アルファベットの単語で不一致の場合のみハイライト
                highlightedWord = `<span class="word-mismatch">${escapedWord}</span>`;
            }
            
            // 適切なスペースを追加（句読点の前後は調整）
            if (isPunctuation || nextIsPunctuation) {
                return highlightedWord;
            } else if (index < originalWords.length - 1) {
                return highlightedWord + ' ';
            } else {
                return highlightedWord;
            }
        }).join('');
    }

    // 結果表示
    showResult(result) {
        console.log('showResult called with:', result);
        
        // 総合スコア表示
        document.getElementById('total-score').textContent = result.total_score.toFixed(1) + '%';
        
        // ターン別結果表示
        const container = document.getElementById('result-details');
        const headerRow = `
            <div class="result-columns-header">
                <div>元の文章</div>
                <div>認識結果</div>
            </div>
        `;
        const turnsHtml = result.turn_results.map(turnResult => {
            console.log('Processing turn:', turnResult);
            
            // 元の文章で不一致箇所をハイライト
            const highlightedOriginal = this.compareTexts(turnResult.original, turnResult.recognized);
            console.log('Highlighted text:', highlightedOriginal);
            
            return `
                <div class="result-turn">
                    <div class="result-turn-header">
                        <div class="listen-turn-number">${turnResult.turn_id}</div>
                        <div class="result-turn-score">${turnResult.score.toFixed(1)}%</div>
                    </div>
                    <div class="result-comparison">
                        <div class="result-original">
                            <div class="highlighted-text">${highlightedOriginal}</div>
                        </div>
                        <div class="result-recognized">
                            <div>${this.escapeHtml(turnResult.recognized)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = headerRow + turnsHtml;
        
        this.hideModal('exercise-detail-modal');
        this.showModal('result-modal');
    }

    // 全体音声再生
    async playFullAudio() {
        // currentExerciseが存在するかチェック
        if (!this.currentExercise || !this.currentExercise.id) {
            this.showError('課題情報が見つかりません');
            return;
        }

        try {
            const audioUrl = `/api/audio/${this.currentExercise.id}/full`;
            
            // 既存のオーディオがある場合は使い回す
            if (!this.listeningAudio || !this.listeningAudio.src.includes(audioUrl)) {
                const audio = new Audio(audioUrl);
                this.listeningAudio = audio;
                this.setupAudioPlayer(audio);
            }
            
            await this.listeningAudio.play();
            
        } catch (error) {
            this.showError('音声の再生に失敗しました: ' + error.message);
        }
    }

    // 音声プレーヤーのセットアップ
    setupAudioPlayer(audio) {
        const seekbar = document.getElementById('audio-seekbar');
        const currentTimeSpan = document.getElementById('audio-current-time');
        const durationSpan = document.getElementById('audio-duration');
        const progressFill = document.querySelector('.audio-progress-fill');
        
        // 時間をMM:SS形式に変換
        const formatTime = (seconds) => {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };
        
        // 音声のメタデータが読み込まれたとき
        audio.onloadedmetadata = () => {
            seekbar.max = audio.duration;
            durationSpan.textContent = formatTime(audio.duration);
        };
        
        // 再生位置が更新されたとき
        audio.ontimeupdate = () => {
            if (!isNaN(audio.duration)) {
                const progress = (audio.currentTime / audio.duration) * 100;
                seekbar.value = audio.currentTime;
                currentTimeSpan.textContent = formatTime(audio.currentTime);
                progressFill.style.width = `${progress}%`;
            }
        };
        
        // 再生開始時
        audio.onplay = () => {
            document.getElementById('play-full-audio-btn').style.display = 'none';
            document.getElementById('pause-full-audio-btn').style.display = 'inline-block';
        };
        
        // 再生終了・一時停止時
        audio.onended = audio.onpause = () => {
            document.getElementById('play-full-audio-btn').style.display = 'inline-block';
            document.getElementById('pause-full-audio-btn').style.display = 'none';
        };
        
        // シークバーの操作
        let isSeeking = false;
        
        seekbar.addEventListener('input', (e) => {
            isSeeking = true;
            const seekTime = parseFloat(e.target.value);
            currentTimeSpan.textContent = formatTime(seekTime);
            const progress = (seekTime / audio.duration) * 100;
            progressFill.style.width = `${progress}%`;
        });
        
        seekbar.addEventListener('change', (e) => {
            const seekTime = parseFloat(e.target.value);
            audio.currentTime = seekTime;
            isSeeking = false;
        });
        
        // シーク中は自動更新を無効化
        audio.addEventListener('timeupdate', () => {
            if (isSeeking) return;
            // 上記のontimeupdateで処理済み
        });
    }

    // 全体音声一時停止
    pauseFullAudio() {
        if (this.listeningAudio) {
            this.listeningAudio.pause();
        }
    }

    // 音声プレーヤーのリセット
    resetAudioPlayer() {
        const seekbar = document.getElementById('audio-seekbar');
        const currentTimeSpan = document.getElementById('audio-current-time');
        const progressFill = document.querySelector('.audio-progress-fill');
        
        if (seekbar) {
            seekbar.value = 0;
        }
        if (currentTimeSpan) {
            currentTimeSpan.textContent = '0:00';
        }
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        
        // ボタンの表示状態をリセット
        document.getElementById('play-full-audio-btn').style.display = 'inline-block';
        document.getElementById('pause-full-audio-btn').style.display = 'none';
    }



    // タイトル編集モード切り替え
    toggleTitleEditMode() {
        const titleInput = document.getElementById('detail-title');
        titleInput.readOnly = false;
        titleInput.focus();
        titleInput.select();
        
        // ボタンの表示切り替え
        document.getElementById('edit-title-btn').style.display = 'none';
        document.getElementById('save-title-btn').style.display = 'inline-block';
        document.getElementById('cancel-title-btn').style.display = 'inline-block';
    }

    // タイトル編集キャンセル
    cancelTitleChanges() {
        const titleInput = document.getElementById('detail-title');
        titleInput.value = this.currentExercise.title;
        titleInput.readOnly = true;
        
        // ボタンの表示切り替え
        document.getElementById('edit-title-btn').style.display = 'inline-block';
        document.getElementById('save-title-btn').style.display = 'none';
        document.getElementById('cancel-title-btn').style.display = 'none';
    }

    // タイトル保存
    async saveTitleChanges() {
        if (!this.currentExercise || !this.currentExercise.id) {
            this.showError('課題情報が見つかりません');
            return;
        }

        const newTitle = document.getElementById('detail-title').value.trim();
        if (!newTitle) {
            this.showError('タイトルを入力してください');
            return;
        }

        try {
            this.showLoading('タイトルを更新中...');
            
            const response = await this.apiCall(`/api/exercises/${this.currentExercise.id}/title`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newTitle)
            });

            if (response.success) {
                this.currentExercise = response.data;
                document.getElementById('detail-title').readOnly = true;
                
                // ボタンの表示切り替え
                document.getElementById('edit-title-btn').style.display = 'inline-block';
                document.getElementById('save-title-btn').style.display = 'none';
                document.getElementById('cancel-title-btn').style.display = 'none';
                
                // 一覧も更新
                this.loadExercises();
                this.showSuccess('タイトルを更新しました');
            } else {
                this.showError(response.message);
            }
        } catch (error) {
            this.showError('タイトルの更新に失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 課題削除
    async deleteExercise() {
        // currentExerciseが存在するかチェック
        if (!this.currentExercise || !this.currentExercise.id) {
            this.showError('課題情報が見つかりません');
            return;
        }

        if (!confirm('この課題を削除してもよろしいですか？関連するデータもすべて削除されます。')) {
            return;
        }

        try {
            this.showLoading('課題を削除中...');
            
            const response = await this.apiCall(`/api/exercises/${this.currentExercise.id}`, {
                method: 'DELETE'
            });

            if (response.success) {
                this.showSuccess('課題を削除しました');
                this.hideModal('exercise-detail-modal');
                this.loadExercises();
            } else {
                this.showError(response.message);
            }
        } catch (error) {
            this.showError('課題の削除に失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 課題結果読み込み
    async loadExerciseResults(exerciseId) {
        try {
            const response = await this.apiCall(`/api/shadowing/${exerciseId}/results`);
            
            if (response.success) {
                this.renderExerciseResults(response.data);
            }
        } catch (error) {
            console.error('結果の読み込みに失敗:', error);
        }
    }

    // 課題結果レンダリング
    renderExerciseResults(results) {
        const container = document.getElementById('results-container');
        
        if (results.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 2rem;">まだ実施結果がありません。</div>';
            return;
        }

        container.innerHTML = results.map(result => `
            <div class="result-item" data-result-id="${result.id}">
                <div class="result-item-header">
                    <span class="result-item-score">${result.total_score.toFixed(1)}%</span>
                    <span class="result-item-date">${this.formatDateTime(result.completed_at)}</span>
                </div>
            </div>
        `).join('');

        // 結果アイテムのクリックイベント
        container.querySelectorAll('.result-item').forEach(item => {
            item.addEventListener('click', () => {
                const resultId = parseInt(item.dataset.resultId);
                const result = results.find(r => r.id === resultId);
                if (result) {
                    this.showResult(result);
                }
            });
        });
    }

    // グローバルキーボードイベントリスナーの設定
    setupKeyboardListeners() {
        // キャプチャフェーズでイベントを捕捉（第3引数をtrueに）
        document.addEventListener('keydown', (event) => {
            // エンターキーが押された場合
            if (event.key === 'Enter') {
                // 課題詳細モーダルが開いている場合
                const detailModal = document.getElementById('exercise-detail-modal');
                
                if (detailModal && detailModal.classList.contains('active')) {
                    // シャドーイングタブがアクティブな場合
                    const shadowingTab = document.getElementById('shadowing-tab');
                    
                    if (shadowingTab && shadowingTab.classList.contains('active')) {
                        // 「開始」ボタンが表示されている場合
                        const startBtn = document.getElementById('start-turn-btn');
                        if (startBtn && startBtn.offsetParent !== null) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.startTurn();
                            return;
                        }
                        
                        // 「次へ」ボタンが表示されている場合
                        const nextBtn = document.getElementById('next-turn-btn');
                        if (nextBtn && nextBtn.offsetParent !== null) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.nextTurn();
                            return;
                        }
                        
                        // 「完了」ボタンが表示されている場合
                        const finishBtn = document.getElementById('finish-shadowing-btn');
                        if (finishBtn && finishBtn.offsetParent !== null) {
                            event.preventDefault();
                            event.stopPropagation();
                            this.finishShadowing();
                            return;
                        }
                    }
                }
            }
        }, true); // キャプチャフェーズでイベントを処理
    }

    // 設定読み込み
    async loadSettings() {
        try {
            const response = await this.apiCall('/api/settings/');
            
            if (response.success) {
                const settings = response.data;
                
                // フォームに設定値を反映
                document.getElementById('speech-rate').value = settings.speech_rate || '1.0';
                document.getElementById('speech-voice').value = settings.speech_voice || 'alloy';
            }
        } catch (error) {
            console.error('設定の読み込みに失敗:', error);
        }
    }

    // 設定保存
    async saveSettings() {
        const speechRate = parseFloat(document.getElementById('speech-rate').value);
        const speechVoice = document.getElementById('speech-voice').value;

        try {
            this.showLoading('設定を保存中...');
            
            const response = await this.apiCall('/api/settings/', {
                method: 'PUT',
                body: JSON.stringify({
                    speech_rate: speechRate,
                    speech_voice: speechVoice
                })
            });

            if (response.success) {
                this.showSuccess('設定を保存しました');
            } else {
                this.showError(response.message);
            }
        } catch (error) {
            this.showError('設定の保存に失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // 設定リセット
    async resetSettings() {
        if (!confirm('設定をデフォルト値にリセットしてもよろしいですか？')) {
            return;
        }

        try {
            this.showLoading('設定をリセット中...');
            
            const response = await this.apiCall('/api/settings/reset', {
                method: 'POST'
            });

            if (response.success) {
                this.loadSettings();
                this.showSuccess('設定をリセットしました');
            } else {
                this.showError(response.message);
            }
        } catch (error) {
            this.showError('設定のリセットに失敗しました: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // HTML エスケープ
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    new ShadowingApp();
});