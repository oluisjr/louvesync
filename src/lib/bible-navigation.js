export function adjacentBibleChapter(books, book, chapter, direction) {
  const index=books.findIndex(item=>item.a===book);
  if (index<0 || ![-1,1].includes(direction)) return null;
  const next=chapter+direction;
  if(next>=1 && next<=books[index].c)return {book,chapter:next};
  const neighbor=books[index+direction];
  return neighbor?{book:neighbor.a,chapter:direction===1?1:neighbor.c}:null;
}
