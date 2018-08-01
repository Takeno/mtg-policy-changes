const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist');

const ORDERED_LIST_REGEX = /^[0-9 ]+\./;
const NESTED_ORDERED_LIST_REGEX = /^([0-9]+\.(?:[0-9]+\.?)*) (.+)/;
const SUMMARY_REGEX = /\.{10,} *[0-9]+ */;
const PARAGRAPH_DELTA = 16;
const LEFT_MARGIN = 100;
const H2_HEIGHT = 160;
const IS_H2 = item => /^([0-9]+\.) (.+)/.test(item.str);
const IS_H3 = item => /^([0-9]+\.(?:[0-9]+\.?)*) (.+)/.test(item.str);
const H_FONT = 'g_d0_f2';

const normalizeContent = (items, page, viewport) => {
    return items
        // remove page numbers
        .filter(item => !(item.transform[4] > 540 && item.transform[5] < 55))
        .map(item => ({
            ...item,
            sizes: pdfjsLib.Util.transform(viewport.transform, item.transform),
            page,
        }))
        // sort by y,x
        .sort((a, b) => a.sizes[5] - b.sizes[5] || a.sizes[4] - b.sizes[4]);
}

async function getTextItems(file) {
    const doc = await pdfjsLib.getDocument(file);

    let textItems = [];
    // doc.numPages
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport(1);

        const textContent = await page.getTextContent();
        textItems = textItems.concat(normalizeContent(textContent.items, i, viewport));
    }

    return textItems;
}

(async (file) => {
    let items = await getTextItems(file);
    // merge words to get a line
    items = items.reduce((items, item) => {
        item.lastX = item.sizes[4];
        item.lastY = item.sizes[5];
        item.isHeading = item.height > H2_HEIGHT;

        if (items.length === 0) {
            return [item];
        }

        const lastItem = items[items.length - 1];
        const lineDelta = item.lastY - lastItem.lastY;

        if (lineDelta > PARAGRAPH_DELTA || lastItem.page !== item.page) {
            return items.concat(item);
        }

        if (Math.abs(lineDelta) < 2) {
            lastItem.str += item.str;
            return items;
        }

        if (item.str.trim().length === 0) {
            return items;
        }

        if (ORDERED_LIST_REGEX.test(item.str)) {
            return items.concat(item);
        }

        // if(ORDERED_LIST_REGEX.test(item.str)) {
        //     return items.concat(item);
        // }

        // new line is more right than the previous:
        // probably is the second row of first list row
        if (!lastItem.isHeading && (item.lastX > (lastItem.lastX + 1) || item.lastX < LEFT_MARGIN)) {
            lastItem.str += item.str;
            lastItem.lastY = item.lastY;
            return items;
        }

        return items.concat(item);
    }, []);


    // find headings & lists
    items = items.map(item => {

        if (SUMMARY_REGEX.test(item.str)) {
            item.str = item.str.replace(SUMMARY_REGEX, '');
            return item;
        }

        if (item.isHeading) {
            item.str = '# ' + item.str;
            return item;
        }

        if (IS_H2(item)) {
            item.str = '## ' + item.str;
            return item;
        }

        if (IS_H3(item)) {
            item.str = '### ' + item.str;
            return item;
        }

        if(item.sizes[4] > LEFT_MARGIN) {
            if(!ORDERED_LIST_REGEX.test(item.str)) {
                item.str = '- ' + item.str.replace('• ', '');
            }
        }

        // if(NESTED_ORDERED_LIST_REGEX.test(item.str)) {
        //     const [, number, text] = item.str.match(NESTED_ORDERED_LIST_REGEX);
        //     const numbers = number.split('.').filter(n => !!n);
        //     const spaces = Array(numbers.length -1).fill('\t').join('');

        //     item.str = `${spaces}${numbers[numbers.length - 1]}. ${text}`;
        // }

        return item;
    });

    fs.writeFileSync(`${__dirname}/../ipg.md`, items.map(i => i.str).join('\n\n'));
})(path.resolve(process.argv[2]));
