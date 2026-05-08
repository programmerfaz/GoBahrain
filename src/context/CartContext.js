import React, { createContext, useContext, useState, useMemo } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState([])
  const [clientId, setClientId] = useState(null)
  const [clientName, setClientName] = useState(null)

  const count = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items])

  const subtotal = useMemo(() => {
    return items.reduce((sum, i) => {
      const price = parseFloat(i.priceRange) || 0
      return sum + price * i.quantity
    }, 0)
  }, [items])

  const addItem = (post) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === post.id)
      if (existing) {
        return prev.map((i) => i.id === post.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [
        ...prev,
        {
          id: post.id,
          clientId: post.clientId,
          businessName: post.businessName || 'Venue',
          clientImage: post.clientImage || null,
          imageUri: post.imageUri || null,
          priceRange: post.priceRange || null,
          description: post.description || '',
          quantity: 1,
        },
      ]
    })
    if (!clientId && post.clientId) {
      setClientId(post.clientId)
      setClientName(post.businessName || 'Venue')
    }
  }

  const updateQty = (id, qty) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, quantity: qty } : i))
    }
  }

  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id))

  const reset = () => {
    setItems([])
    setClientId(null)
    setClientName(null)
  }

  return (
    <CartContext.Provider
      value={{ items, count, clientId, clientName, subtotal, addItem, updateQty, removeItem, reset, setClientId, setClientName }}
    >
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
