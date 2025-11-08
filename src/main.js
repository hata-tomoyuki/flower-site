import * as THREE from 'three'

// シーンの作成
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x87ceeb)

// カメラの作成
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
)
camera.position.z = 8

// レンダラーの作成
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

// テクスチャローダー
const textureLoader = new THREE.TextureLoader()

// アニメーション用の変数
let time = 0
const flowerMeshes = [] // 複数のメッシュを管理する配列

// 画像ファイルのリスト
const flowerImages = [
    '/flower1.png',
    '/flower2.png',
    '/flower3.png',
    '/flower4.png',
    '/flower5.png',
    '/flower6.png',
    '/flower7.png',
    '/flower8.png',
    '/flower9.png'
]

// ポジション設定（後で変更しやすいように定数として定義）
const POSITION_CONFIG = {
    cols: 3,           // グリッドの列数
    spacing: 3.5,      // 画像間の間隔
    // 個別のポジションを指定する場合は、以下のように配列で定義可能
    customPositions: [
        { x: 0, y: 0, z: 1 },
        { x: 2.5, y: 3, z: 0 },
        { x: -1, y: 3, z: 1 },
        { x: -3.5, y: 1.5, z: 0 },
        { x: -3, y: -2, z: 0 },
        { x: 0.5, y: 4, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: -0.5, y: -3, z: 0 },
        { x: 2.5, y: -2.5, z: 0 }
    ]
}

// ポジションを計算する関数
function calculatePosition(index, total) {
    // カスタムポジションが定義されている場合はそれを使用
    if (POSITION_CONFIG.customPositions && POSITION_CONFIG.customPositions[index]) {
        const custom = POSITION_CONFIG.customPositions[index]
        return { x: custom.x, y: custom.y, z: custom.z || 0 }
    }

    // グリッド状に配置
    const { cols, spacing } = POSITION_CONFIG
    const row = Math.floor(index / cols)
    const col = index % cols
    const offsetX = (cols - 1) * spacing / 2
    const offsetY = (Math.ceil(total / cols) - 1) * spacing / 2

    return {
        x: col * spacing - offsetX,
        y: -row * spacing + offsetY,
        z: 0
    }
}

// 画像を読み込んで3D空間上に表示する関数
function loadFlowerImage(imagePath, index, total) {
    return new Promise((resolve) => {
        textureLoader.load(imagePath, (texture) => {
            // 画像のアスペクト比を取得
            const aspectRatio = texture.image.width / texture.image.height

            // 画像のサイズを決定（高さを基準に）
            const height = 4
            const width = height * aspectRatio

            // 平面ジオメトリを作成（細かく分割して滑らかな歪みを実現）
            const geometry = new THREE.PlaneGeometry(width, height, 32, 32)

            // 元の頂点位置を保存
            const originalPositions = geometry.attributes.position.array.slice()

            // テクスチャをマテリアルに適用
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide,
                transparent: true,
                alphaTest: 0.1
            })

            // メッシュを作成
            const flowerMesh = new THREE.Mesh(geometry, material)

            // ポジションを計算して設定
            const position = calculatePosition(index, total)
            flowerMesh.position.set(position.x, position.y, position.z)

            // メッシュ情報を保存（初期ポジションも保存）
            flowerMeshes.push({
                mesh: flowerMesh,
                geometry: geometry,
                originalPositions: originalPositions,
                initialPosition: { ...position } // 初期ポジションを保存
            })

            scene.add(flowerMesh)
            resolve() // Promiseを解決
        })
    })
}

// すべての画像を読み込む（Promiseで管理）
const loadPromises = flowerImages.map((imagePath, index) => {
    return loadFlowerImage(imagePath, index, flowerImages.length)
})

// すべての画像が読み込まれた後に実行
Promise.all(loadPromises).then(() => {
    // ここでポジションを変更可能
    //   updateFlowerPosition(0, 0, 0, 0)
})

// ポジションを変更する関数（後で呼び出し可能）
function updateFlowerPosition(index, x, y, z) {
    if (flowerMeshes[index]) {
        flowerMeshes[index].mesh.position.set(x, y, z)
        // 初期ポジションも更新（必要に応じて）
        if (flowerMeshes[index].initialPosition) {
            flowerMeshes[index].initialPosition = { x, y, z }
        }
    } else {
        console.warn(`Flower mesh at index ${index} is not loaded yet.`)
    }
}

// すべてのポジションを再計算して更新する関数
function updateAllPositions() {
    flowerMeshes.forEach((flowerData, index) => {
        const position = calculatePosition(index, flowerImages.length)
        flowerData.mesh.position.set(position.x, position.y, position.z)
        if (flowerData.initialPosition) {
            flowerData.initialPosition = { ...position }
        }
    })
}

// 歪みアニメーション関数
function distortGeometry() {
    // すべてのメッシュに歪みを適用
    flowerMeshes.forEach((flowerData) => {
        const { geometry, originalPositions } = flowerData
        const positions = geometry.attributes.position

        // 各頂点を歪ませる
        for (let i = 0; i < positions.count; i++) {
            const i3 = i * 3

            // 元の位置を取得
            const originalX = originalPositions[i3]
            const originalY = originalPositions[i3 + 1]
            const originalZ = originalPositions[i3 + 2]

            // 波のような歪み効果
            const waveX = Math.sin(originalX * 2 + time * 2) * 0.05
            const waveY = Math.cos(originalY * 2 + time * 2) * 0.05

            // 頂点位置を更新
            positions.setXYZ(i, originalX + waveX, originalY + waveY, originalZ)
        }

        // 法線を再計算
        positions.needsUpdate = true
        geometry.computeVertexNormals()
    })
}

// アニメーションループ
function animate() {
    requestAnimationFrame(animate)

    time += 0.005

    // 歪みアニメーションを適用
    distortGeometry()

    renderer.render(scene, camera)
}

// ウィンドウリサイズの処理
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()

