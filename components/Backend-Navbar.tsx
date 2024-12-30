// components/Backend-Navbar.tsx
'use client';

import React from 'react';

const BackendNavbar: React.FC = () => (
    <nav style={{backgroundColor: '#2D3748', padding: '10px', color: 'white'}}>
        <a href="/admin" style={{marginRight: '15px', fontWeight: 'bold'}}>
            Admin Dashboard
        </a>
        <a href="/admin/books" style={{marginRight: '15px'}}>Books</a>
        <a href="/admin/genres" style={{marginRight: '15px'}}>Genres</a>
        <a href="/admin/news">News Articles</a>
    </nav>
);

export default BackendNavbar;
