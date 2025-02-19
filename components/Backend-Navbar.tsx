'use client';

import React from 'react';
import Link from 'next/link';

const BackendNavbar: React.FC = () => (
    <nav style={{backgroundColor: '#2D3748', padding: '10px', color: 'white'}}>
        <Link href="/admin" style={{marginRight: '45px', fontWeight: 'bold'}}>
            Administration
        </Link>
        <Link href="/admin/books" style={{marginRight: '35px'}}>Catalogue</Link>
        <Link href="/admin/genres" style={{marginRight: '35px'}}>Genres</Link>
        <Link href="/admin/news" style={{marginRight: '35px'}}>Dernières infos</Link>
        <Link href="/admin/manage_coups_de_coeur" style={{marginRight: '35px'}}>Coups de Coeur</Link>
        <Link href="/admin/profile" style={{marginRight: '35px'}}>Mon Compte</Link>
        <Link href="/" style={{marginRight: '35px'}}>Site principal</Link>
    </nav>
);

export default BackendNavbar;