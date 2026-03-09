/**
 * Core Cart Logic (Extracted from app.js)
 */
export function addToCart(cart, product) {
    if (!product) return cart;

    const newCart = [...cart];
    const existingItem = newCart.find(item => item.id === product.id);

    if (existingItem) {
        existingItem.quantidade++;
    } else {
        newCart.push({ ...product, quantidade: 1 });
    }

    return newCart;
}

export function removeFromCart(cart, productId) {
    return cart.filter(item => item.id !== productId);
}

export function calculateSubtotal(cart) {
    return cart.reduce((sum, item) => sum + ((parseFloat(item.preco) || 0) * item.quantidade), 0);
}

export function formatCurrency(value) {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
}
