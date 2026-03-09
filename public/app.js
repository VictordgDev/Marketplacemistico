import { addToCart as cartAdd, removeFromCart as cartRemove, calculateSubtotal, formatCurrency } from './cart-logic.js';

// ==================== CONFIGURAÇÃO INICIAL ====================
let currentUser = null;
let authToken = null;
const API_BASE = '/api';
let activeMode = null; // 'cliente' or 'vendedor'

// Expose functions to window for onclick handlers
window.navigateHome = navigateHome;
window.showPage = showPage;
window.toggleUserMode = toggleUserMode;
window.showCart = showCart;
window.logout = logout;
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.navigateHomeFromSidebar = navigateHomeFromSidebar;
window.navigateFromSidebar = navigateFromSidebar;
window.logoutFromSidebar = logoutFromSidebar;
window.closeLoginModal = closeLoginModal;
window.goToLogin = goToLogin;
window.goToRegister = goToRegister;
window.closeBecomeVendorModal = closeBecomeVendorModal;
window.goToVendorRegistration = goToVendorRegistration;
window.setUserTypeAndRegister = setUserTypeAndRegister;
window.showDashboardSection = showDashboardSection;
window.enterClienteEditMode = enterClienteEditMode;
window.cancelClienteEditMode = cancelClienteEditMode;
window.toggleSellerFields = toggleSellerFields;
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.validatePasswordMatch = validatePasswordMatch;
window.formatCpfCnpj = formatCpfCnpj;
window.validateCpfCnpjField = validateCpfCnpjField;
window.handleGoogleRegister = handleGoogleRegister;
window.handleGoogleLogin = handleGoogleLogin;
window.cancelVendorRegistration = cancelVendorRegistration;
window.showBecomeVendorModal = showBecomeVendorModal;
window.enterEditMode = enterEditMode;
window.cancelEditMode = cancelEditMode;
window.showMyStore = showMyStore;
window.contactSeller = contactSeller;
window.filterStoreByCategory = filterStoreByCategory;
window.filterByCategory = filterByCategory;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartQuantity = updateCartQuantity;
window.cancelAddProduct = cancelAddProduct;
window.deleteProduct = deleteProduct;
window.formatCep = formatCep;
window.validateEditCpfCnpjField = validateEditCpfCnpjField;
window.filterProducts = filterProducts;
window.goToLogin = goToLogin;
window.goToRegister = goToRegister;
window.goToVendorRegistration = goToVendorRegistration;
window.showBecomeVendorModal = showBecomeVendorModal;
window.showLoginModal = showLoginModal;
window.closeLoginModal = closeLoginModal;
window.closeBecomeVendorModal = closeBecomeVendorModal;

const estadosBrasileiros = [
    { code: 'AC', name: 'Acre' }, { code: 'AL', name: 'Alagoas' }, { code: 'AP', name: 'Amapá' },
    { code: 'AM', name: 'Amazonas' }, { code: 'BA', name: 'Bahia' }, { code: 'CE', name: 'Ceará' },
    { code: 'DF', name: 'Distrito Federal' }, { code: 'ES', name: 'Espírito Santo' },
    { code: 'GO', name: 'Goiás' }, { code: 'MA', name: 'Maranhão' }, { code: 'MT', name: 'Mato Grosso' },
    { code: 'MS', name: 'Mato Grosso do Sul' }, { code: 'MG', name: 'Minas Gerais' },
    { code: 'PA', name: 'Pará' }, { code: 'PB', name: 'Paraíba' }, { code: 'PR', name: 'Paraná' },
    { code: 'PE', name: 'Pernambuco' }, { code: 'PI', name: 'Piauí' }, { code: 'RJ', name: 'Rio de Janeiro' },
    { code: 'RN', name: 'Rio Grande do Norte' }, { code: 'RS', name: 'Rio Grande do Sul' },
    { code: 'RO', name: 'Rondônia' }, { code: 'RR', name: 'Roraima' }, { code: 'SC', name: 'Santa Catarina' },
    { code: 'SP', name: 'São Paulo' }, { code: 'SE', name: 'Sergipe' }, { code: 'TO', name: 'Tocantins' }
];

let products = [];
let shoppingCart = [];
let currentFilter = 'Todos';

// ==================== HELPERS ====================
function getProductImageHTML(product) {
    if (product.imagem_url) {
        return `<img src="${product.imagem_url}" alt="${product.nome}">`;
    }
    return '<div class="no-image">Sem imagem</div>';
}

// ==================== API HELPERS ====================
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });

        const data = await response.json();

        if (response.status === 401) {
            // Token inválido – limpar sessão e redirecionar para login
            authToken = null;
            currentUser = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            showPage('login');
            throw new Error((data.error && data.error.message) || 'Sessão expirada. Faça login novamente.');
        }

        if (!response.ok) {
            throw new Error((data.error && data.error.message) || data.error || 'Erro na requisição');
        }

        // Return the unwrapped payload from the standardized envelope
        return data.data !== undefined ? data.data : data;
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

async function loadProducts(categoria = 'Todos') {
    try {
        const endpoint = categoria === 'Todos' 
            ? '/products' 
            : `/products?categoria=${encodeURIComponent(categoria)}`;
        
        const data = await apiRequest(endpoint);
        products = data.products;
        renderProducts();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
    }
}

async function loadSellerProducts() {
    if (!currentUser || !currentUser.seller_id) return;

    try {
        const data = await apiRequest(`/products?seller_id=${currentUser.seller_id}`);
        renderSellerProducts(data.products);
    } catch (error) {
        console.error('Erro ao carregar produtos do vendedor:', error);
    }
}

// ==================== NAVEGAÇÃO ====================
function toggleUserMode() {
    console.log('🔄 toggleUserMode() chamado');
    console.log('👤 currentUser:', currentUser);
    console.log('📍 activeMode atual:', activeMode);
    
    if (!currentUser) {
        alert('Você precisa estar logado para alternar entre modos');
        return;
    }
    
    // Only allow toggle if user is a vendor (vendors can act as both cliente and vendedor)
    if (currentUser.tipo !== 'vendedor') {
        alert('Apenas vendedores podem alternar entre os modos Cliente e Vendedor');
        return;
    }
    
    // Toggle between cliente and vendedor mode
    if (activeMode === 'cliente') {
        activeMode = 'vendedor';
    } else {
        activeMode = 'cliente';
    }
    
    console.log('📍 Novo activeMode:', activeMode);
    
    // Save to localStorage
    localStorage.setItem('activeMode', activeMode);
    
    // Update the toggle button
    updateModeToggleButton();
    
    // Navigate to appropriate dashboard
    navigateHome();
}

function updateModeToggleButton() {
    const modeToggleContainer = document.getElementById('mode-toggle-container');
    const mobileModeToggleContainer = document.getElementById('mobile-mode-toggle-container');
    const modeIcon = document.getElementById('mode-icon');
    const modeText = document.getElementById('mode-text');
    const mobileModeIcon = document.getElementById('mobile-mode-icon');
    const mobileModeText = document.getElementById('mobile-mode-text');
    
    // Show/hide toggle button based on user type
    if (currentUser && currentUser.tipo === 'vendedor') {
        if (modeToggleContainer) {
            modeToggleContainer.classList.remove('hidden');
        }
        if (mobileModeToggleContainer) {
            mobileModeToggleContainer.classList.remove('hidden');
        }
        
        // Update button text and icon based on active mode
        if (activeMode === 'cliente') {
            if (modeIcon) modeIcon.textContent = '🛒';
            if (modeText) modeText.textContent = 'Cliente';
            if (mobileModeIcon) mobileModeIcon.textContent = '🛒';
            if (mobileModeText) mobileModeText.textContent = 'Cliente';
        } else {
            if (modeIcon) modeIcon.textContent = '🏪';
            if (modeText) modeText.textContent = 'Vendedor';
            if (mobileModeIcon) mobileModeIcon.textContent = '🏪';
            if (mobileModeText) mobileModeText.textContent = 'Vendedor';
        }
    } else {
        if (modeToggleContainer) {
            modeToggleContainer.classList.add('hidden');
        }
        if (mobileModeToggleContainer) {
            mobileModeToggleContainer.classList.add('hidden');
        }
    }
}

function navigateHome() {
    console.log('🏠 navigateHome() chamado');
    console.log('👤 currentUser:', currentUser);
    console.log('📍 activeMode:', activeMode);
    
    const user = getCurrentUser();
    
    if (!user) {
        console.log('➡️ Sem usuário, indo para marketplace');
        showPage('marketplace');
        loadProducts();
    } else if (user.tipo === 'vendedor') {
        // For vendors, use activeMode to determine which dashboard to show
        if (activeMode === 'cliente') {
            console.log('➡️ Vendedor em modo Cliente, indo para dashboard-cliente');
            showPage('dashboard-cliente');
            loadProducts();
            populateClienteDashboard();
        } else {
            console.log('➡️ Vendedor em modo Vendedor, indo para dashboard-vendedor');
            showPage('dashboard-vendedor');
            loadSellerProducts();
            populateSellerDashboard();
        }
    } else if (user.tipo === 'cliente') {
        console.log('➡️ Cliente, indo para dashboard-cliente');
        activeMode = 'cliente'; // Ensure clients stay in cliente mode
        showPage('dashboard-cliente');
        loadProducts();
        populateClienteDashboard();
    } else {
        console.log('➡️ Tipo desconhecido, indo para marketplace');
        showPage('marketplace');
        loadProducts();
    }
}

function populateSellerDashboard() {
    if (!currentUser || currentUser.tipo !== 'vendedor') return;
    
    const sellerNameEl = document.getElementById('seller-name');
    const storeNameEl = document.getElementById('store-name');
    
    if (sellerNameEl) {
        sellerNameEl.textContent = currentUser.nome || 'Vendedor';
    }
    if (storeNameEl) {
        storeNameEl.textContent = currentUser.nome_loja || 'Sua Loja';
    }
}

function populateClienteDashboard() {
    if (!currentUser || currentUser.tipo !== 'cliente') return;
    
    const customerNameEl = document.getElementById('customer-name');
    
    if (customerNameEl) {
        customerNameEl.textContent = currentUser.nome || 'Cliente';
    }
}

function getCurrentUser() {
    return currentUser;
}

function navigateHomeFromSidebar() {
    closeMobileSidebar();
    navigateHome();
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
    }
    clearMessages();
}

function setUserTypeAndRegister(userType) {
    showPage('registro');
    if (userType === 'vendedor') {
        document.getElementById('tipo-vendedor').checked = true;
    } else {
        document.getElementById('tipo-cliente').checked = true;
    }
    toggleSellerFields();
}

function showDashboardSection(userType, section) {
    console.log(`📊 Mostrando seção ${section} para ${userType}`);
    
    // For now, just show the appropriate page based on section
    if (section === 'carrinho') {
        showPage('carrinho');
        renderCart();
    } else if (section === 'perfil') {
        if (userType === 'cliente') {
            showPage('cliente-profile');
            populateClienteProfile();
        } else {
            showPage('seller-profile');
            populateSellerProfile();
        }
    } else if (section === 'pedidos') {
        if (userType === 'cliente') {
            showPage('cliente-pedidos');
        } else {
            showPage('vendedor-pedidos');
        }
    } else if (section === 'produtos') {
        showPage('seller-products');
        loadSellerProducts();
    } else if (section === 'adicionar') {
        showPage('add-product');
    }
}

function populateClienteProfile() {
    if (!currentUser || currentUser.tipo !== 'cliente') return;
    
    const setDisplayText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || 'Não informado';
    };
    
    setDisplayText('cliente-display-nome', currentUser.nome);
    setDisplayText('cliente-display-email', currentUser.email);
    setDisplayText('cliente-display-telefone', currentUser.telefone);
    setDisplayText('cliente-display-cep', currentUser.cep);
    setDisplayText('cliente-display-rua', currentUser.rua);
    setDisplayText('cliente-display-numero', currentUser.numero);
    setDisplayText('cliente-display-complemento', currentUser.complemento);
    setDisplayText('cliente-display-bairro', currentUser.bairro);
    setDisplayText('cliente-display-cidade', currentUser.cidade);
    setDisplayText('cliente-display-estado', currentUser.estado);
}

function populateSellerProfile() {
    if (!currentUser || currentUser.tipo !== 'vendedor') return;
    
    const setDisplayText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || 'Não informado';
    };
    
    // Populate view mode
    setDisplayText('display-nome-loja', currentUser.nome_loja);
    setDisplayText('display-descricao-loja', currentUser.descricao_loja);
    setDisplayText('display-categoria', currentUser.categoria);
    setDisplayText('display-cpf-cnpj', currentUser.cpf_cnpj);
    setDisplayText('display-email', currentUser.email);
    
    // Load and display product count
    if (currentUser.seller_id) {
        apiRequest(`/products?seller_id=${currentUser.seller_id}`)
            .then(data => {
                const productCount = data.products ? data.products.length : 0;
                setDisplayText('display-total-produtos', productCount);
            })
            .catch(err => {
                console.error('Erro ao carregar contagem de produtos:', err);
            });
    }
}

function goToMarketplaceWithCategory(category) {
    showPage('marketplace');
    filterByCategory(category);
}

function showMyStore() {
    if (!currentUser || !currentUser.seller_id) {
        alert('Apenas vendedores podem ver sua loja');
        return;
    }
    
    // Load and display the store page with seller's own data
    loadStoreData(currentUser.seller_id);
    showPage('store-page');
}

async function loadStoreData(sellerId) {
    try {
        // Load seller data
        const sellerData = currentUser;
        
        // Load seller's products
        const productsData = await apiRequest(`/products?seller_id=${sellerId}`);
        const sellerProducts = productsData.products || [];
        
        // Populate store page
        const storeNameDisplay = document.getElementById('store-name-display');
        const storeBreadcrumb = document.getElementById('store-breadcrumb-name');
        const storeCategoryDisplay = document.getElementById('store-category-display');
        const storeDescriptionDisplay = document.getElementById('store-description-display');
        const storeProductsCount = document.getElementById('store-products-count');
        const storeMemberSince = document.getElementById('store-member-since');
        const storeAvatar = document.getElementById('store-avatar');
        const storeProductsTitle = document.getElementById('store-products-title');
        
        if (storeNameDisplay) storeNameDisplay.textContent = sellerData.nome_loja || 'Loja';
        if (storeBreadcrumb) storeBreadcrumb.textContent = sellerData.nome_loja || 'Loja';
        if (storeCategoryDisplay) storeCategoryDisplay.textContent = sellerData.categoria || 'Categoria';
        if (storeDescriptionDisplay) storeDescriptionDisplay.textContent = sellerData.descricao_loja || 'Sem descrição';
        if (storeProductsCount) storeProductsCount.textContent = sellerProducts.length;
        if (storeProductsTitle) storeProductsTitle.textContent = sellerData.nome_loja || 'Esta Loja';
        
        if (storeAvatar) {
            const initial = (sellerData.nome_loja || 'L').charAt(0).toUpperCase();
            storeAvatar.textContent = initial;
        }
        
        if (storeMemberSince && sellerData.created_at) {
            const date = new Date(sellerData.created_at);
            const month = date.toLocaleDateString('pt-BR', { month: 'short' });
            const year = date.getFullYear();
            storeMemberSince.textContent = `${month} ${year}`;
        }
        
        // Render store products
        renderStoreProducts(sellerProducts);
        
    } catch (error) {
        console.error('Erro ao carregar dados da loja:', error);
        alert('Erro ao carregar dados da loja');
    }
}

function renderStoreProducts(storeProducts) {
    const container = document.getElementById('store-products-grid');
    const emptyState = document.getElementById('store-empty-state');
    
    if (!container) return;
    
    if (storeProducts.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    container.innerHTML = storeProducts.map(product => `
        <div class="product-card">
            <div class="product-image">
                ${getProductImageHTML(product)}
            </div>
            <div class="product-info">
                <h3>${product.nome}</h3>
                <p class="product-description">${product.descricao || ''}</p>
                <p class="product-price">R$ ${(parseFloat(product.preco) || 0).toFixed(2).replace('.', ',')}</p>
                <button onclick="addToCart(${product.id})" class="btn-primary">Adicionar ao Carrinho</button>
            </div>
        </div>
    `).join('');
}

// ==================== FORMS ====================
function toggleSellerFields() {
    const isVendedor = document.getElementById('tipo-vendedor').checked;
    const sellerFields = document.getElementById('seller-fields');
    if (isVendedor) {
        sellerFields.classList.add('show');
    } else {
        sellerFields.classList.remove('show');
    }
}

// ==================== PROFILE EDITING ====================
function enterClienteEditMode() {
    const viewMode = document.getElementById('cliente-profile-view-mode');
    const editMode = document.getElementById('cliente-profile-edit-mode');
    
    if (viewMode) viewMode.style.display = 'none';
    if (editMode) editMode.style.display = 'block';
    
    // Populate edit form with current user data
    if (currentUser) {
        const setFieldValue = (id, value) => {
            const field = document.getElementById(id);
            if (field) field.value = value || '';
        };
        
        setFieldValue('edit-cliente-nome', currentUser.nome);
        setFieldValue('edit-cliente-telefone', currentUser.telefone);
        setFieldValue('edit-cliente-cep', currentUser.cep);
        setFieldValue('edit-cliente-rua', currentUser.rua);
        setFieldValue('edit-cliente-numero', currentUser.numero);
        setFieldValue('edit-cliente-complemento', currentUser.complemento);
        setFieldValue('edit-cliente-bairro', currentUser.bairro);
        setFieldValue('edit-cliente-cidade', currentUser.cidade);
        setFieldValue('edit-cliente-estado', currentUser.estado);
        
        const emailDisplay = document.getElementById('edit-cliente-display-email');
        if (emailDisplay) emailDisplay.textContent = currentUser.email;
    }
}

function cancelClienteEditMode() {
    const viewMode = document.getElementById('cliente-profile-view-mode');
    const editMode = document.getElementById('cliente-profile-edit-mode');
    
    if (viewMode) viewMode.style.display = 'block';
    if (editMode) editMode.style.display = 'none';
}

function enterEditMode() {
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');
    
    if (viewMode) viewMode.style.display = 'none';
    if (editMode) editMode.style.display = 'block';
    
    // Populate edit form with current user data
    if (currentUser) {
        const setFieldValue = (id, value) => {
            const field = document.getElementById(id);
            if (field) field.value = value || '';
        };
        
        setFieldValue('edit-nome-loja', currentUser.nome_loja);
        setFieldValue('edit-descricao-loja', currentUser.descricao_loja);
        setFieldValue('edit-categoria', currentUser.categoria);
        setFieldValue('edit-cpf-cnpj', currentUser.cpf_cnpj);
        
        const emailDisplay = document.getElementById('edit-display-email');
        if (emailDisplay) emailDisplay.textContent = currentUser.email;
    }
}

function cancelEditMode() {
    const viewMode = document.getElementById('profile-view-mode');
    const editMode = document.getElementById('profile-edit-mode');
    
    if (viewMode) viewMode.style.display = 'block';
    if (editMode) editMode.style.display = 'none';
}

function cancelAddProduct() {
    // Cancel adding product and return to products list
    showPage('seller-products');
}

function contactSeller(sellerId) {
    // Future implementation: contact seller
    alert('Funcionalidade de contato em desenvolvimento');
}

function filterStoreByCategory(categoria) {
    // Future implementation: filter store products by category
    filterByCategory(categoria);
}

// ==================== VALIDAÇÕES ====================
function formatCpfCnpj(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length <= 11) {
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
        value = value.replace(/(\d{2})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d)/, '$1.$2');
        value = value.replace(/(\d{3})(\d)/, '$1/$2');
        value = value.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
    input.value = value;
}

function formatCep(input) {
    let value = input.value.replace(/\D/g, '');
    value = value.substring(0, 8); // Limit to 8 digits
    value = value.replace(/(\d{5})(\d)/, '$1-$2');
    input.value = value;
}

function validateCpfCnpj(cpfCnpj) {
    if (!cpfCnpj) return true;
    const numbers = cpfCnpj.replace(/\D/g, '');
    return numbers.length === 11 || numbers.length === 14;
}

function validateCpfCnpjField() {
    // Check both registration form and vendor form
    const cpfCnpjRegistro = document.getElementById('cpf-cnpj-registro');
    const cpfCnpjVendor = document.getElementById('vendor-cpf-cnpj');
    
    let cpfCnpj = '';
    let cpfCnpjError = null;
    
    if (cpfCnpjRegistro && cpfCnpjRegistro.offsetParent !== null) {
        // Registration form field
        cpfCnpj = cpfCnpjRegistro.value.trim();
        cpfCnpjError = document.getElementById('cpf-cnpj-registro-error');
    } else if (cpfCnpjVendor && cpfCnpjVendor.offsetParent !== null) {
        // Vendor upgrade form field
        cpfCnpj = cpfCnpjVendor.value.trim();
        cpfCnpjError = document.getElementById('vendor-cpf-cnpj-error');
    }
    
    if (cpfCnpjError && cpfCnpj && !validateCpfCnpj(cpfCnpj)) {
        cpfCnpjError.style.display = 'block';
        return false;
    } else if (cpfCnpjError) {
        cpfCnpjError.style.display = 'none';
        return true;
    }
    return true;
}

function validateEditCpfCnpjField() {
    const cpfCnpjEdit = document.getElementById('edit-cpf-cnpj');
    const cpfCnpjError = document.getElementById('edit-cpf-cnpj-error');
    
    if (!cpfCnpjEdit || !cpfCnpjError) return true;
    
    const cpfCnpj = cpfCnpjEdit.value.trim();
    
    if (cpfCnpj && !validateCpfCnpj(cpfCnpj)) {
        cpfCnpjError.style.display = 'block';
        return false;
    } else {
        cpfCnpjError.style.display = 'none';
        return true;
    }
}

function validateEmail() {
    const email = document.getElementById('email').value;
    const emailError = document.getElementById('email-error');
    const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (email && !emailPattern.test(email)) {
        emailError.style.display = 'block';
        return false;
    } else {
        emailError.style.display = 'none';
        return true;
    }
}

function validatePassword() {
    const senha = document.getElementById('senha').value;
    const senhaError = document.getElementById('senha-error');
    if (senha && senha.length < 8) {
        senhaError.style.display = 'block';
        return false;
    } else {
        senhaError.style.display = 'none';
        return true;
    }
}

function validatePasswordMatch() {
    const senha = document.getElementById('senha').value;
    const confirmarSenha = document.getElementById('confirmar-senha').value;
    const confirmarSenhaError = document.getElementById('confirmar-senha-error');
    if (confirmarSenha && senha !== confirmarSenha) {
        confirmarSenhaError.style.display = 'block';
        return false;
    } else {
        confirmarSenhaError.style.display = 'none';
        return true;
    }
}

function clearMessages() {
    const regContainer = document.getElementById('registration-messages');
    const logContainer = document.getElementById('login-messages');
    if (regContainer) regContainer.innerHTML = '';
    if (logContainer) logContainer.innerHTML = '';
}

function showMessage(containerId, message, isError = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const className = isError ? 'error-alert' : 'success-message';
    container.innerHTML = `<div class="${className}">${message}</div>`;
}

// ==================== AUTENTICAÇÃO ====================
function handleGoogleRegister() {
    window.location.href = '/api/auth/google';
}

function handleGoogleLogin() {
    window.location.href = '/api/auth/google';
}

async function register(event) {
    event.preventDefault();
    clearMessages();

    if (!validateEmail() || !validatePassword() || !validatePasswordMatch()) {
        showMessage('registration-messages', 'Por favor, corrija os erros no formulário', true);
        return;
    }

    const tipo = document.getElementById('tipo-vendedor').checked ? 'vendedor' : 'cliente';
    const nome = document.getElementById('nome').value.trim();
    const email = document.getElementById('email').value.trim();
    const senha = document.getElementById('senha').value;
    const telefone = document.getElementById('telefone').value.trim();
    const cpf_cnpj = document.getElementById('cpf-cnpj-registro').value.trim();

    if (!nome || !email || !senha || !telefone || !cpf_cnpj) {
        showMessage('registration-messages', 'Por favor, preencha todos os campos obrigatórios', true);
        return;
    }

    // Validate CPF/CNPJ format
    if (!validateCpfCnpj(cpf_cnpj)) {
        document.getElementById('cpf-cnpj-registro-error').style.display = 'block';
        showMessage('registration-messages', 'CPF/CNPJ inválido', true);
        return;
    } else {
        document.getElementById('cpf-cnpj-registro-error').style.display = 'none';
    }

    const userData = { tipo, nome, email, senha, telefone, cpf_cnpj };

    if (tipo === 'vendedor') {
        const nomeLoja = document.getElementById('nome-loja').value.trim();
        const categoria = document.getElementById('categoria').value;
        const descricaoLoja = document.getElementById('descricao-loja').value.trim();

        if (!nomeLoja || !categoria) {
            showMessage('registration-messages', 'Por favor, preencha os dados da loja', true);
            return;
        }

        userData.nomeLoja = nomeLoja;
        userData.categoria = categoria;
        userData.descricaoLoja = descricaoLoja;
    }

    try {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        });

        showMessage('registration-messages', 'Cadastro realizado com sucesso! Entrando na sua conta...');

        // Auto-login logic
        authToken = data.token;
        currentUser = data.user;

        // Map backend names to frontend expected names if necessary
        if (currentUser.nomeLoja && !currentUser.nome_loja) {
            currentUser.nome_loja = currentUser.nomeLoja;
        }
        if (currentUser.descricaoLoja && !currentUser.descricao_loja) {
            currentUser.descricao_loja = currentUser.descricaoLoja;
        }

        if (currentUser.tipo === 'vendedor') {
            activeMode = 'vendedor';
        } else {
            activeMode = 'cliente';
        }

        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        localStorage.setItem('activeMode', activeMode);

        setTimeout(() => {
            updateNavbar();
            navigateHome();
            document.getElementById('registrationForm').reset();
        }, 2000);

    } catch (error) {
        showMessage('registration-messages', error.message, true);
    }
}

async function login(event) {
    event.preventDefault();
    clearMessages();

    console.log('=== INÍCIO DO LOGIN ===');

    const emailInput = document.getElementById('login-email');
    const senhaInput = document.getElementById('login-senha');

    if (!emailInput || !senhaInput) {
        console.error('❌ Campos do formulário não encontrados!');
        alert('ERRO: Campos do formulário não encontrados. Verifique o HTML.');
        return;
    }

    const email = emailInput.value.trim();
    const senha = senhaInput.value;

    console.log('📧 Email:', email);
    console.log('🔑 Senha:', senha ? '***' : 'vazia');

    if (!email || !senha) {
        console.warn('⚠️ Email ou senha vazios');
        showMessage('login-messages', 'Por favor, preencha email e senha', true);
        return;
    }

    try {
        console.log('📡 Fazendo requisição para /api/auth/login...');
        
        const url = '/api/auth/login';
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, senha })
        };

        console.log('📤 URL:', url);

        const response = await fetch(url, options);

        console.log('📨 Response status:', response.status);
        console.log('📨 Response ok:', response.ok);

        const data = await response.json();
        console.log('📦 Response data:', data);

        if (!response.ok) {
            console.error('❌ Erro na resposta:', data.error);
            throw new Error((data.error && data.error.message) || data.error || 'Erro ao fazer login');
        }

        if (!data.success) {
            console.error('❌ Login falhou:', data);
            throw new Error((data.error && data.error.message) || data.error || 'Login falhou');
        }

        const payload = data.data || data;

        if (!payload.token) {
            console.error('❌ Token não recebido:', data);
            throw new Error('Token não recebido do servidor');
        }

        console.log('✅ Login bem-sucedido!');
        console.log('🎫 Token:', payload.token.substring(0, 20) + '...');
        console.log('👤 User:', payload.user);

        authToken = payload.token;
        currentUser = payload.user;

        // Map backend names to frontend expected names if necessary
        if (currentUser.nomeLoja && !currentUser.nome_loja) {
            currentUser.nome_loja = currentUser.nomeLoja;
        }
        if (currentUser.descricaoLoja && !currentUser.descricao_loja) {
            currentUser.descricao_loja = currentUser.descricaoLoja;
        }
        
        // Set initial activeMode based on user type
        if (currentUser.tipo === 'vendedor') {
            // Vendors default to vendedor mode
            activeMode = 'vendedor';
        } else {
            // Clients always in cliente mode
            activeMode = 'cliente';
        }
        
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        localStorage.setItem('activeMode', activeMode);

        console.log('💾 Dados salvos no localStorage');

        updateNavbar();
        
        console.log('🏠 Navegando para home...');
        navigateHome();
        
        document.getElementById('loginForm').reset();

        console.log('=== LOGIN CONCLUÍDO ===');

    } catch (error) {
        console.error('💥 ERRO CAPTURADO:', error);
        console.error('Stack:', error.stack);
        showMessage('login-messages', error.message, true);
    }
}

function logout() {
    currentUser = null;
    authToken = null;
    activeMode = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('activeMode');
    updateNavbar();
    showPage('marketplace');
    loadProducts();
}

// ==================== PRODUTOS ====================
async function addProduct(event) {
    event.preventDefault();

    if (!currentUser || currentUser.tipo !== 'vendedor') {
        alert('Apenas vendedores podem adicionar produtos');
        return;
    }

    const nome = document.getElementById('product-name').value.trim();
    const categoria = document.getElementById('product-category').value;
    const descricao = document.getElementById('product-description').value.trim();
    const preco = parseFloat(document.getElementById('product-price').value);
    const estoque = parseInt(document.getElementById('product-stock').value);
    const imagemUrl = document.getElementById('product-image').value.trim();
    const publicado = document.getElementById('product-published').checked;

    if (!nome || !categoria || isNaN(preco)) {
        alert('Preencha todos os campos obrigatórios');
        return;
    }

    try {
        await apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify({
                nome, categoria, descricao, preco, estoque, imagemUrl, publicado
            })
        });

        document.getElementById('addProductForm').reset();
        showPage('seller-products');
        await loadSellerProducts();
        alert('Produto adicionado com sucesso!');

    } catch (error) {
        alert('Erro ao adicionar produto: ' + error.message);
    }
}

async function deleteProduct(productId) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) {
        return;
    }

    try {
        await apiRequest(`/products/${productId}`, {
            method: 'DELETE'
        });

        await loadSellerProducts();
        alert('Produto excluído com sucesso!');

    } catch (error) {
        alert('Erro ao excluir produto: ' + error.message);
    }
}

// ==================== RENDERIZAÇÃO ====================
function updateNavbar() {
    console.log('🔄 Atualizando navbar...');
    
    // Desktop navigation elements
    const navLoginLink = document.getElementById('nav-login-link');
    const navRegisterLink = document.getElementById('nav-register-link');
    const logoutLink = document.getElementById('logout-link');
    const cartNavLink = document.getElementById('cart-nav-link');
    
    // Mobile sidebar elements
    const mobileLoginLink = document.getElementById('mobile-login-link');
    const mobileRegisterLink = document.getElementById('mobile-register-link');
    const mobileLogoutLink = document.getElementById('mobile-logout-link');
    const mobileCartLink = document.getElementById('mobile-cart-link');

    if (currentUser) {
        console.log('✅ Usuário logado:', currentUser.tipo);
        
        // Hide login/register links
        if (navLoginLink) navLoginLink.style.display = 'none';
        if (navRegisterLink) navRegisterLink.style.display = 'none';
        if (mobileLoginLink) mobileLoginLink.style.display = 'none';
        if (mobileRegisterLink) mobileRegisterLink.style.display = 'none';
        
        // Show logout link
        if (logoutLink) {
            logoutLink.classList.remove('hidden');
            logoutLink.style.display = 'block';
        }
        if (mobileLogoutLink) {
            mobileLogoutLink.classList.remove('hidden');
            mobileLogoutLink.style.display = 'block';
        }
        
        // Show cart for all logged-in users (vendors can also buy)
        if (cartNavLink) {
            cartNavLink.classList.remove('hidden');
            cartNavLink.style.display = 'block';
        }
        if (mobileCartLink) {
            mobileCartLink.classList.remove('hidden');
            mobileCartLink.style.display = 'block';
        }
        
        // Update mode toggle button
        updateModeToggleButton();
    } else {
        console.log('ℹ️ Sem usuário, mostrando botões de auth');
        
        // Show login/register links
        if (navLoginLink) navLoginLink.style.display = 'block';
        if (navRegisterLink) navRegisterLink.style.display = 'block';
        if (mobileLoginLink) mobileLoginLink.style.display = 'block';
        if (mobileRegisterLink) mobileRegisterLink.style.display = 'block';
        
        // Hide logout and cart links
        if (logoutLink) {
            logoutLink.classList.add('hidden');
            logoutLink.style.display = 'none';
        }
        if (mobileLogoutLink) {
            mobileLogoutLink.classList.add('hidden');
            mobileLogoutLink.style.display = 'none';
        }
        if (cartNavLink) {
            cartNavLink.classList.add('hidden');
            cartNavLink.style.display = 'none';
        }
        if (mobileCartLink) {
            mobileCartLink.classList.add('hidden');
            mobileCartLink.style.display = 'none';
        }
        
        // Hide mode toggle button
        updateModeToggleButton();
    }
}

function renderProducts(productsToRender = products) {
    const container = document.getElementById('products-grid');
    
    if (!container) {
        console.error('Container products-grid não encontrado');
        return;
    }
    
    if (productsToRender.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Nenhum produto encontrado</p>';
        return;
    }

    container.innerHTML = productsToRender.map(product => `
        <div class="product-card">
            <div class="product-image">
                ${getProductImageHTML(product)}
            </div>
            <div class="product-info">
                <h3>${product.nome}</h3>
                <p class="product-description">${product.descricao || ''}</p>
                <p class="product-seller">Vendido por: ${product.nome_loja}</p>
                <p class="product-price">R$ ${(parseFloat(product.preco) || 0).toFixed(2).replace('.', ',')}</p>
                <button onclick="addToCart(${product.id})" class="btn-primary">Adicionar ao Carrinho</button>
            </div>
        </div>
    `).join('');
}

function renderSellerProducts(sellerProducts) {
    const container = document.getElementById('seller-products-content');
    
    if (!container) {
        console.error('Container seller-products-content não encontrado');
        return;
    }
    
    if (sellerProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Você ainda não tem produtos cadastrados.</p>
                <button onclick="showPage('add-product')" class="btn-primary">Adicionar Produto</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="products-table">
            <thead>
                <tr>
                    <th>Produto</th>
                    <th>Categoria</th>
                    <th>Preço</th>
                    <th>Estoque</th>
                    <th>Status</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                ${sellerProducts.map(product => `
                    <tr>
                        <td>
                            <strong>${product.nome}</strong><br>
                            <small>${product.descricao ? product.descricao.substring(0, 50) + '...' : ''}</small>
                        </td>
                        <td>${product.categoria}</td>
                        <td>R$ ${(parseFloat(product.preco) || 0).toFixed(2).replace('.', ',')}</td>
                        <td>${product.estoque}</td>
                        <td>
                            <span class="badge ${product.publicado ? 'badge-success' : 'badge-warning'}">
                                ${product.publicado ? 'Publicado' : 'Rascunho'}
                            </span>
                        </td>
                        <td>
                            <button onclick="deleteProduct(${product.id})" class="btn-danger btn-sm">Excluir</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// ==================== CARRINHO ====================
function addToCart(productId) {
    // Check if user is logged in
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    // All logged-in users can add to cart (vendors can also buy)
    const product = products.find(p => p.id === productId);
    if (!product) return;

    shoppingCart = cartAdd(shoppingCart, product);

    updateCartBadge();
    alert('Produto adicionado ao carrinho!');
}

function removeFromCart(productId) {
    shoppingCart = cartRemove(shoppingCart, productId);
    updateCartBadge();
    renderCart();
}

function updateCartQuantity(productId, newQuantity) {
    const item = shoppingCart.find(item => item.id === productId);
    if (item && newQuantity > 0) {
        item.quantidade = newQuantity;
    }
    updateCartBadge();
    renderCart();
}

function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    const mobileCartCount = document.getElementById('mobile-cart-count');
    const totalItems = shoppingCart.reduce((sum, item) => sum + item.quantidade, 0);
    
    if (badge) {
        badge.textContent = totalItems;
        badge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
    
    if (mobileCartCount) {
        mobileCartCount.textContent = totalItems;
    }
}

function showCart() {
    showPage('carrinho');
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const subtotalElement = document.getElementById('cart-subtotal');
    const subtitleElement = document.getElementById('cart-subtitle');

    if (!container || !subtotalElement) return;

    const totalItems = shoppingCart.reduce((sum, item) => sum + item.quantidade, 0);
    
    if (subtitleElement) {
        subtitleElement.textContent = totalItems === 0 ? '0 itens no carrinho' : 
                                     totalItems === 1 ? '1 item no carrinho' : 
                                     `${totalItems} itens no carrinho`;
    }

    if (shoppingCart.length === 0) {
        container.innerHTML = `
            <div class="empty-cart-state">
                <div class="empty-cart-icon">🛒</div>
                <h3>Seu carrinho está vazio</h3>
                <p>Adicione produtos ao seu carrinho para continuar comprando</p>
                <button onclick="showPage('marketplace')" class="btn">🔍 Explorar Produtos</button>
            </div>
        `;
        subtotalElement.textContent = 'R$ 0,00';
        return;
    }

    const subtotal = calculateSubtotal(shoppingCart);
    subtotalElement.textContent = formatCurrency(subtotal);

    container.innerHTML = shoppingCart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <h4>${item.nome}</h4>
                <p>Vendido por: ${item.nome_loja}</p>
                <p class="product-price">R$ ${(parseFloat(item.preco) || 0).toFixed(2).replace('.', ',')}</p>
            </div>
            <div class="cart-item-actions">
                <input type="number" min="1" value="${item.quantidade}" 
                       onchange="updateCartQuantity(${item.id}, parseInt(this.value))" 
                       style="width: 60px;">
                <button onclick="removeFromCart(${item.id})" class="btn-danger btn-sm">Remover</button>
            </div>
        </div>
    `).join('');
}

function filterByCategory(categoria) {
    // Get all filter buttons once
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    // Remove active class from all buttons
    filterButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find and activate the clicked button
    filterButtons.forEach(btn => {
        if (btn.textContent.includes(categoria) || (categoria === 'Todos' && btn.textContent === 'Todos')) {
            btn.classList.add('active', 'loading');
            
            // Remove loading after a short delay
            setTimeout(() => {
                btn.classList.remove('loading');
            }, 300);
        }
    });
    
    currentFilter = categoria;
    loadProducts(categoria);
}

function filterProducts() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const noProductsMsg = document.getElementById('no-products');

    if (!searchTerm) {
        if (noProductsMsg) noProductsMsg.style.display = 'none';
        renderProducts(products);
        return;
    }

    const filtered = products.filter(product =>
        product.nome.toLowerCase().includes(searchTerm) ||
        (product.descricao && product.descricao.toLowerCase().includes(searchTerm)) ||
        (product.nome_loja && product.nome_loja.toLowerCase().includes(searchTerm)) ||
        (product.categoria && product.categoria.toLowerCase().includes(searchTerm))
    );

    if (noProductsMsg) {
        noProductsMsg.style.display = filtered.length === 0 ? 'block' : 'none';
    }

    renderProducts(filtered);
}

// ==================== MOBILE ====================
function toggleMobileSidebar() {
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar && overlay) {
        const isActive = sidebar.classList.contains('active');
        if (isActive) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    }
}

function openMobileSidebar() {
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) sidebar.classList.add('active');
    if (overlay) overlay.classList.add('active');
}

function closeMobileSidebar() {
    const sidebar = document.querySelector('.mobile-sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

function navigateFromSidebar(pageId) {
    closeMobileSidebar();
    showPage(pageId);
    if (pageId === 'carrinho') {
        renderCart();
    }
}

function logoutFromSidebar() {
    closeMobileSidebar();
    logout();
}

// ==================== LOGIN MODAL ====================
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function goToLogin() {
    closeLoginModal();
    showPage('login');
}

function goToRegister() {
    closeLoginModal();
    showPage('registro');
}

// ==================== BECOME VENDOR MODAL ====================
function showBecomeVendorModal() {
    const modal = document.getElementById('becomeVendorModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeBecomeVendorModal() {
    const modal = document.getElementById('becomeVendorModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function goToVendorRegistration() {
    closeBecomeVendorModal();
    showPage('vendor-registration');
}

function cancelVendorRegistration() {
    if (currentUser && currentUser.tipo === 'cliente') {
        showPage('dashboard-cliente');
    } else {
        showPage('marketplace');
    }
}

// ==================== VENDOR CONVERSION ====================
async function upgradeToVendor(event) {
    event.preventDefault();
    
    if (!currentUser || currentUser.tipo !== 'cliente') {
        alert('Apenas clientes podem se tornar vendedores');
        return;
    }
    
    const nomeLoja = document.getElementById('vendor-nome-loja').value.trim();
    const categoria = document.getElementById('vendor-categoria').value;
    const descricao = document.getElementById('vendor-descricao').value.trim();
    const cpfCnpj = document.getElementById('vendor-cpf-cnpj').value.trim();
    
    if (!nomeLoja || !categoria || !cpfCnpj) {
        showMessage('vendor-registration-messages', 'Por favor, preencha todos os campos obrigatórios', true);
        return;
    }
    
    if (!validateCpfCnpj(cpfCnpj)) {
        document.getElementById('vendor-cpf-cnpj-error').style.display = 'block';
        showMessage('vendor-registration-messages', 'CPF/CNPJ inválido', true);
        return;
    } else {
        document.getElementById('vendor-cpf-cnpj-error').style.display = 'none';
    }
    
    try {
        // Call API to upgrade user to vendedor
        const data = await apiRequest('/users/upgrade-to-vendor', {
            method: 'POST',
            body: JSON.stringify({
                nome_loja: nomeLoja,
                categoria: categoria,
                descricao_loja: descricao,
                cpf_cnpj: cpfCnpj
            })
        });
        
        // apiRequest returns the unwrapped payload; errors are thrown
        currentUser = data.user;
        
        if (data.token) {
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
        }
        
        activeMode = 'vendedor';
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        localStorage.setItem('activeMode', activeMode);
        
        showMessage('vendor-registration-messages', 'Parabéns! Você agora é um vendedor!', false);
        
        // Navigate to vendor dashboard after a brief delay
        setTimeout(() => {
            updateNavbar();
            showPage('dashboard-vendedor');
            loadSellerProducts();
            populateSellerDashboard();
            }, 2000);
    } catch (error) {
        console.error('Erro ao se tornar vendedor:', error);
        showMessage('vendor-registration-messages', error.message, true);
    }
}

// ==================== PROFILE EDITING ====================
async function updateSellerProfile(event) {
    event.preventDefault();
    
    if (!currentUser || currentUser.tipo !== 'vendedor') {
        alert('Apenas vendedores podem editar perfil de vendedor');
        return;
    }
    
    const nomeLoja = document.getElementById('edit-nome-loja').value.trim();
    const descricaoLoja = document.getElementById('edit-descricao-loja').value.trim();
    const categoria = document.getElementById('edit-categoria').value;
    const cpfCnpj = document.getElementById('edit-cpf-cnpj').value.trim();
    
    if (!nomeLoja || !categoria) {
        showMessage('profile-edit-messages', 'Por favor, preencha todos os campos obrigatórios', true);
        return;
    }
    
    if (cpfCnpj && !validateCpfCnpj(cpfCnpj)) {
        document.getElementById('edit-cpf-cnpj-error').style.display = 'block';
        showMessage('profile-edit-messages', 'CPF/CNPJ inválido', true);
        return;
    }
    
    try {
        // TODO: Call API to update seller profile when endpoint is available
        // await apiRequest('/sellers/profile', {
        //     method: 'PUT',
        //     body: JSON.stringify({ nome_loja: nomeLoja, descricao_loja: descricaoLoja, categoria, cpf_cnpj: cpfCnpj })
        // });
        
        // For now, just update localStorage (will not persist across sessions until API is implemented)
        currentUser.nome_loja = nomeLoja;
        currentUser.descricao_loja = descricaoLoja;
        currentUser.categoria = categoria;
        if (cpfCnpj) currentUser.cpf_cnpj = cpfCnpj;
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        showMessage('profile-edit-messages', 'Perfil atualizado com sucesso!', false);
        
        setTimeout(() => {
            cancelEditMode();
            populateSellerProfile();
        }, 1500);
        
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        showMessage('profile-edit-messages', error.message, true);
    }
}

async function updateClienteProfile(event) {
    event.preventDefault();
    
    if (!currentUser || currentUser.tipo !== 'cliente') {
        alert('Apenas clientes podem editar perfil de cliente');
        return;
    }
    
    const nome = document.getElementById('edit-cliente-nome').value.trim();
    const telefone = document.getElementById('edit-cliente-telefone').value.trim();
    const cep = document.getElementById('edit-cliente-cep').value.trim();
    const rua = document.getElementById('edit-cliente-rua').value.trim();
    const numero = document.getElementById('edit-cliente-numero').value.trim();
    const complemento = document.getElementById('edit-cliente-complemento').value.trim();
    const bairro = document.getElementById('edit-cliente-bairro').value.trim();
    const cidade = document.getElementById('edit-cliente-cidade').value.trim();
    const estado = document.getElementById('edit-cliente-estado').value;
    
    if (!nome) {
        showMessage('cliente-profile-edit-messages', 'Nome é obrigatório', true);
        return;
    }
    
    try {
        // TODO: Call API to update client profile when endpoint is available
        // await apiRequest('/users/profile', {
        //     method: 'PUT',
        //     body: JSON.stringify({ nome, telefone, cep, rua, numero, complemento, bairro, cidade, estado })
        // });
        
        // For now, just update localStorage (will not persist across sessions until API is implemented)
        currentUser.nome = nome;
        currentUser.telefone = telefone;
        currentUser.cep = cep;
        currentUser.rua = rua;
        currentUser.numero = numero;
        currentUser.complemento = complemento;
        currentUser.bairro = bairro;
        currentUser.cidade = cidade;
        currentUser.estado = estado;
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        showMessage('cliente-profile-edit-messages', 'Perfil atualizado com sucesso!', false);
        
        setTimeout(() => {
            cancelClienteEditMode();
            populateClienteProfile();
        }, 1500);
        
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        showMessage('cliente-profile-edit-messages', error.message, true);
    }
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando aplicação...');
    
    // Attach form event listeners
    const registrationForm = document.getElementById('registrationForm');
    const loginForm = document.getElementById('loginForm');
    const addProductForm = document.getElementById('addProductForm');
    const vendorRegistrationForm = document.getElementById('vendorRegistrationForm');
    
    if (registrationForm) {
        registrationForm.addEventListener('submit', register);
        console.log('✅ Registration form event listener attached');
    } else {
        console.error('❌ Registration form not found!');
    }
    
    if (loginForm) {
        loginForm.addEventListener('submit', login);
        console.log('✅ Login form event listener attached');
    } else {
        console.error('❌ Login form not found!');
    }
    
    if (addProductForm) {
        addProductForm.addEventListener('submit', addProduct);
        console.log('✅ Add product form event listener attached');
    } else {
        console.log('ℹ️ Add product form not found (will be attached when page loads)');
    }
    
    if (vendorRegistrationForm) {
        vendorRegistrationForm.addEventListener('submit', upgradeToVendor);
        console.log('✅ Vendor registration form event listener attached');
    } else {
        console.log('ℹ️ Vendor registration form not found (will be attached when page loads)');
    }
    
    const editProfileForm = document.getElementById('editProfileForm');
    const editClienteProfileForm = document.getElementById('editClienteProfileForm');
    
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', updateSellerProfile);
        console.log('✅ Edit seller profile form event listener attached');
    } else {
        console.log('ℹ️ Edit seller profile form not found (will be attached when page loads)');
    }
    
    if (editClienteProfileForm) {
        editClienteProfileForm.addEventListener('submit', updateClienteProfile);
        console.log('✅ Edit cliente profile form event listener attached');
    } else {
        console.log('ℹ️ Edit cliente profile form not found (will be attached when page loads)');
    }
    
    // Populate estado selects
    const estadoSelects = document.querySelectorAll('#edit-cliente-estado');
    estadoSelects.forEach(select => {
        if (select && select.children.length === 1) {
            estadosBrasileiros.forEach(estado => {
                const option = document.createElement('option');
                option.value = estado.code;
                option.textContent = estado.name;
                select.appendChild(option);
            });
        }
    });
    
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');
    const savedActiveMode = localStorage.getItem('activeMode');
    
    // Check for token and user in URL (from Google callback)
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const userFromUrl = urlParams.get('user');

    if (tokenFromUrl && userFromUrl) {
        console.log('🎫 Token e usuário encontrados na URL. Salvando sessão...');
        try {
            authToken = tokenFromUrl;
            currentUser = JSON.parse(decodeURIComponent(userFromUrl));
            activeMode = currentUser.tipo === 'vendedor' ? 'vendedor' : 'cliente';

            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            localStorage.setItem('activeMode', activeMode);

            // Clean URL
            window.history.replaceState({}, document.title, "/");
            console.log('✅ Sessão do Google salva!');
        } catch (e) {
            console.error('Erro ao processar dados de login do Google:', e);
        }
    }

    if (savedToken && savedUser && !tokenFromUrl) {
        console.log('📝 Restaurando sessão do localStorage...');
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        
        // Restore activeMode or set default based on user type
        if (savedActiveMode) {
            activeMode = savedActiveMode;
        } else {
            // Set default activeMode
            activeMode = currentUser.tipo === 'vendedor' ? 'vendedor' : 'cliente';
            localStorage.setItem('activeMode', activeMode);
        }
        
        console.log('✅ Sessão restaurada:', currentUser);
        console.log('📍 activeMode restaurado:', activeMode);
        updateNavbar();
    } else if (tokenFromUrl) {
        // Just updated state from URL, update navbar
        updateNavbar();
    } else {
        console.log('ℹ️ Sem sessão salva');
    }

    console.log('🏠 Navegando para home...');
    navigateHome();
});
