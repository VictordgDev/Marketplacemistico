import { addToCart, removeFromCart, calculateSubtotal, formatCurrency } from '../../public/cart-logic.js';

describe('Cart Logic', () => {
    let initialCart;

    beforeEach(() => {
        initialCart = [];
    });

    test('should add a product to an empty cart', () => {
        const product = { id: 1, nome: 'Cristal', preco: 50.0 };
        const newCart = addToCart(initialCart, product);

        expect(newCart).toHaveLength(1);
        expect(newCart[0]).toEqual({ ...product, quantidade: 1 });
    });

    test('should increment quantity if product already in cart', () => {
        const product = { id: 1, nome: 'Cristal', preco: 50.0, seller_id: 10 };
        let cart = addToCart(initialCart, product);
        cart = addToCart(cart, product);

        expect(cart).toHaveLength(1);
        expect(cart[0].quantidade).toBe(2);
    });

    test('should remove a product from cart', () => {
        const cart = [
            { id: 1, nome: 'Cristal', preco: 50.0, quantidade: 1 },
            { id: 2, nome: 'Vela', preco: 15.0, quantidade: 2 }
        ];
        const newCart = removeFromCart(cart, 1);

        expect(newCart).toHaveLength(1);
        expect(newCart[0].id).toBe(2);
    });

    test('should block adding product from a different seller', () => {
        const firstProduct = { id: 1, nome: 'Cristal', preco: 50.0, seller_id: 10 };
        const secondProduct = { id: 2, nome: 'Vela', preco: 15.0, seller_id: 20 };
        let cart = addToCart(initialCart, firstProduct);
        cart = addToCart(cart, secondProduct);

        expect(cart).toHaveLength(1);
        expect(cart[0].id).toBe(1);
    });

    test('should calculate subtotal correctly', () => {
        const cart = [
            { id: 1, nome: 'Cristal', preco: 50.0, quantidade: 2 },
            { id: 2, nome: 'Vela', preco: 15.0, quantidade: 1 }
        ];

        const subtotal = calculateSubtotal(cart);
        expect(subtotal).toBe(115.0);
    });

    test('should format currency correctly', () => {
        expect(formatCurrency(115.0)).toBe('R$ 115,00');
        expect(formatCurrency(10.5)).toBe('R$ 10,50');
    });
});
