import clsx from 'clsx';
import { MouseEventHandler, ReactNode } from 'react';

export default function Button(props: {
  className?: string;
  href?: string;
  imgUrl: string;
  onClick?: MouseEventHandler;
  title?: string;
  children: ReactNode;
}) {
  const Element = props.href ? 'a' : 'button';
  return (
    <Element
      className={clsx(
        'button text-white shadow-solid text-xl pointer-events-auto whitespace-nowrap shrink-0',
        props.className,
      )}
      href={props.href}
      type={props.href ? undefined : 'button'}
      title={props.title}
      onClick={props.onClick}
    >
      <span className="inline-block bg-clay-700">
        <span>
          <span className="inline-flex h-full items-center gap-4">
            <img
              className="w-4 h-4 sm:w-[30px] sm:h-[30px]"
              src={props.imgUrl}
              alt=""
              aria-hidden="true"
            />
            {props.children}
          </span>
        </span>
      </span>
    </Element>
  );
}
