'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';

export default function Nav() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'New' },
    { href: '/kept', label: 'Kept' },
    { href: '/deleted', label: 'Deleted' },
  ];

  return (
    <nav className={styles.nav}>
      <div className={`container ${styles.navInner}`}>
        <Link href="/" className={styles.logo}>
          Util Finder
        </Link>
        <div className={styles.links}>
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.link} ${pathname === link.href ? styles.linkActive : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
