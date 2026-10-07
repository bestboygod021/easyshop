import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { get, qs } from '../lib/api';
import { number } from '../lib/format';
import { Loading } from '../components/ui';
import { ProductGrid } from '../components/ProductCard';
import { toast } from '../store';

/** صفحه‌ی یک دسته‌بندی با زیردسته‌ها و محصولات */
export default function Category() {
  const { slug } = useParams();
  const [cat, setCat] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChild, setActiveChild] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      get(`/categories/${slug}`),
      get(`/products?${qs({ category: slug, limit: 24, sort: 'popular' })}`),
    ])
      .then(([c, p]) => {
        setCat(c);
        setProducts(p.items);
      })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [slug]);

  const loadChild = async (childSlug) => {
    if (!childSlug) {
      setActiveChild('');
      const p = await get(`/products?${qs({ category: slug, limit: 24 })}`);
      setProducts(p.items);
      return;
    }
    setActiveChild(childSlug);
    const p = await get(`/products?${qs({ category: childSlug, limit: 24 })}`);
    setProducts(p.items);
  };

  if (loading) return <Loading />;
  if (!cat?.category) return null;

  return (
    <div className="mx-auto max-w-7xl px-3 py-5 sm:px-5">
      <nav className="mb-4 flex items-center gap-2 text-[11px] text-slate-500">
        <Link to="/" className="hover:text-brand-300">خانه</Link>
        <span>/</span>
        <Link to="/categories" className="hover:text-brand-300">دسته‌بندی‌ها</Link>
        {cat.parent ? (
          <>
            <span>/</span>
            <Link to={`/categories/${cat.parent.slug}`} className="hover:text-brand-300">{cat.parent.name}</Link>
          </>
        ) : null}
        <span>/</span>
        <span className="text-slate-300">{cat.category.name}</span>
      </nav>

      <header className="mb-5 rounded-3xl border border-white/10 bg-gradient-to-l from-brand-600/15 to-transparent p-5">
        <h1 className="text-lg font-extrabold text-white">{cat.category.name}</h1>
        <p className="mt-2 text-xs leading-6 text-slate-400">{cat.category.description}</p>
        <p className="mt-2 text-[11px] text-slate-500">{number(cat.category.product_count)} کالا در این دسته</p>
        {cat.children?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/products?category=${slug}`} className="chip border border-white/10 bg-white/5 text-slate-300 hover:border-brand-500/40">
              همه
            </Link>
            {cat.children.map((c) => (
              <button
                key={c.id}
                onClick={() => loadChild(c.slug)}
                className={`chip border ${activeChild === c.slug ? 'border-brand-500/50 bg-brand-500/15 text-brand-200' : 'border-white/10 bg-white/5 text-slate-300 hover:border-brand-500/40'}`}
              >
                {c.name} ({number(c.product_count)})
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <ProductGrid products={products} />

      <Link to="/products" className="btn-ghost mt-8 w-full sm:w-auto">
        <ArrowRight className="h-4 w-4" /> مشاهده همه محصولات فروشگاه
      </Link>
    </div>
  );
}
